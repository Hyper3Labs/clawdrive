// packages/core/src/taxonomy.ts
import { join } from "node:path";
import { uuidv7 } from "uuidv7";
import * as lancedb from "@lancedb/lancedb";
import {
  Schema,
  Field,
  Float32,
  FixedSizeList,
  Utf8,
  Int32,
} from "apache-arrow";
import type { TaxonomyNode } from "./types.js";
import { createDatabase, getFilesTable } from "./storage/db.js";
import { acquireLock } from "./lock.js";

const VECTOR_DIM = 3072;
const TAXONOMY_TABLE = "taxonomy";
const MAX_NODE_ITEMS = 8;

// ─── Tree output type ────────────────────────────────────────────────

export interface TaxonomyTreeNode {
  id: string;
  label: string;
  parentId: string | null;
  itemCount: number;
  children?: TaxonomyTreeNode[];
}

// ─── Schema ──────────────────────────────────────────────────────────

function buildTaxonomySchema(): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field("label", new Utf8(), false),
    new Field("parent_id", new Utf8(), true),
    new Field(
      "centroid_vector",
      new FixedSizeList(VECTOR_DIM, new Field("item", new Float32())),
      false,
    ),
    new Field("item_count", new Int32(), false),
  ]);
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function getTaxonomyTable(
  db: lancedb.Connection,
): Promise<lancedb.Table> {
  const tableNames = await db.tableNames();
  if (tableNames.includes(TAXONOMY_TABLE)) {
    return db.openTable(TAXONOMY_TABLE);
  }
  return db.createEmptyTable(TAXONOMY_TABLE, buildTaxonomySchema());
}

function toTaxonomyNode(raw: Record<string, unknown>): TaxonomyNode {
  const row = { ...raw };
  if (
    row.centroid_vector != null &&
    !(row.centroid_vector instanceof Float32Array)
  ) {
    row.centroid_vector = new Float32Array(
      row.centroid_vector as ArrayLike<number>,
    );
  }
  return {
    id: row.id as string,
    label: row.label as string,
    parentId: (row.parent_id as string) ?? null,
    centroidVector: row.centroid_vector as Float32Array,
    itemCount: row.item_count as number,
  };
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Find the nearest leaf node to the given vector by cosine similarity.
 */
function findNearestLeaf(
  nodes: TaxonomyNode[],
  vector: Float32Array,
): TaxonomyNode {
  // Only consider leaf nodes (nodes with itemCount > 0 or nodes with no children)
  const nodeIds = new Set(nodes.map((n) => n.id));
  const parentIds = new Set(
    nodes.filter((n) => n.parentId).map((n) => n.parentId!),
  );
  // Leaf nodes are those that are not parents of other nodes
  const leafNodes = nodes.filter((n) => !parentIds.has(n.id));

  let best = leafNodes[0];
  let bestSim = -Infinity;
  for (const node of leafNodes) {
    const sim = cosineSimilarity(vector, node.centroidVector);
    if (sim > bestSim) {
      bestSim = sim;
      best = node;
    }
  }
  return best;
}

/**
 * Build the taxonomy_path for a node: walk up the parent chain to root.
 */
function buildTaxonomyPath(
  nodeId: string,
  nodesById: Map<string, TaxonomyNode>,
): string[] {
  const path: string[] = [];
  let current: TaxonomyNode | undefined = nodesById.get(nodeId);
  while (current) {
    path.unshift(current.label);
    current = current.parentId
      ? nodesById.get(current.parentId)
      : undefined;
  }
  return path;
}

/**
 * Generate a label from filenames by finding the most common words.
 */
function generateLabel(fileNames: string[]): string {
  const wordCounts = new Map<string, number>();
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with",
    "is", "it", "at", "by", "from", "as", "md", "txt", "pdf", "doc",
    "jpg", "png", "js", "ts", "tsx", "jsx", "css", "html",
  ]);

  for (const name of fileNames) {
    // Remove extension, split on non-alpha chars
    const base = name.replace(/\.[^.]+$/, "");
    const words = base
      .split(/[^a-zA-Z]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 1 && !stopWords.has(w));
    const seen = new Set<string>();
    for (const word of words) {
      if (!seen.has(word)) {
        seen.add(word);
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }
  }

  // Take top 1-2 most frequent words
  const sorted = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topWords = sorted.slice(0, 2).map(([w]) => w);

  if (topWords.length === 0) return "Group";
  return topWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─── Core functions ──────────────────────────────────────────────────

/**
 * Assign a file to a taxonomy node. Creates the root node if none exist.
 * When a node exceeds MAX_NODE_ITEMS, it splits into 2 child nodes.
 */
export async function assignToTaxonomy(
  vector: Float32Array,
  fileId: string,
  fileName: string,
  opts: { wsPath: string },
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const taxTable = await getTaxonomyTable(db);
    const filesTable = await getFilesTable(db, wsPath);

    // Get all existing taxonomy nodes
    const rawNodes = await taxTable.query().toArray();
    const nodes = rawNodes.map((r) =>
      toTaxonomyNode(r as Record<string, unknown>),
    );

    if (nodes.length === 0) {
      // Create root node
      const rootId = uuidv7();
      await taxTable.add([
        {
          id: rootId,
          label: "All",
          parent_id: null,
          centroid_vector: Array.from(vector),
          item_count: 1,
        },
      ]);

      // Update file's taxonomy_path
      await filesTable.update({
        where: `id = '${fileId}'`,
        values: { taxonomy_path: ["All"] },
      });
      return;
    }

    // Find nearest leaf node
    const nearest = findNearestLeaf(nodes, vector);

    // Increment item count and update centroid (running average)
    const oldCount = nearest.itemCount;
    const newCount = oldCount + 1;
    const newCentroid = new Float32Array(VECTOR_DIM);
    for (let i = 0; i < VECTOR_DIM; i++) {
      newCentroid[i] =
        (nearest.centroidVector[i] * oldCount + vector[i]) / newCount;
    }

    await taxTable.update({
      where: `id = '${nearest.id}'`,
      values: {
        item_count: newCount,
        centroid_vector: Array.from(newCentroid),
      },
    });

    // Update file's taxonomy_path
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    // Update nearest node in our local copy for path building
    nodesById.set(nearest.id, { ...nearest, itemCount: newCount });
    const taxPath = buildTaxonomyPath(nearest.id, nodesById);

    await filesTable.update({
      where: `id = '${fileId}'`,
      values: { taxonomy_path: taxPath },
    });

    // Check if node exceeds max items
    if (newCount > MAX_NODE_ITEMS) {
      await splitNode(nearest.id, { wsPath });
    }
  } finally {
    await release();
  }
}

/**
 * Split a taxonomy node into 2 child nodes using k-means clustering.
 */
export async function splitNode(
  nodeId: string,
  opts: { wsPath: string },
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");

  // NOTE: We don't acquire a separate lock here because splitNode is called
  // from within assignToTaxonomy which already holds the lock.
  // If called standalone, the caller should handle locking.

  const db = await createDatabase(dbPath);
  const taxTable = await getTaxonomyTable(db);
  const filesTable = await getFilesTable(db, wsPath);

  // Get the node being split
  const rawNodes = await taxTable.query().toArray();
  const allNodes = rawNodes.map((r) =>
    toTaxonomyNode(r as Record<string, unknown>),
  );
  const nodesById = new Map(allNodes.map((n) => [n.id, n]));
  const targetNode = nodesById.get(nodeId);
  if (!targetNode) return;

  // Get the taxonomy path for this node to find its files
  const taxPath = buildTaxonomyPath(nodeId, nodesById);
  const taxPathStr = taxPath.join("/");

  // Get all non-deleted parent files (parent_id IS NULL) and find ones assigned to this node
  const allFiles = await filesTable
    .query()
    .where("deleted_at IS NULL AND parent_id IS NULL")
    .toArray();

  type FileRow = Record<string, unknown>;
  const nodeFiles: FileRow[] = [];
  for (const rawFile of allFiles) {
    const file = rawFile as FileRow;
    let fileTaxPath: string[] = [];
    const tp = file.taxonomy_path;
    if (tp != null && typeof tp === "object" && "toArray" in (tp as object)) {
      fileTaxPath = Array.from(
        (tp as { toArray(): unknown[] }).toArray(),
      ) as string[];
    } else if (Array.isArray(tp)) {
      fileTaxPath = tp as string[];
    }
    if (fileTaxPath.join("/") === taxPathStr) {
      nodeFiles.push(file);
    }
  }

  if (nodeFiles.length < 2) return;

  // Get vectors for these files
  const vectors: Float32Array[] = nodeFiles.map((f) => {
    const v = f.vector;
    if (v instanceof Float32Array) return v;
    return new Float32Array(v as ArrayLike<number>);
  });

  // K-means with k=2
  const k = 2;
  // Pick 2 random initial centroids
  const idx0 = 0;
  const idx1 = Math.min(Math.floor(nodeFiles.length / 2), nodeFiles.length - 1);
  const centroids = [
    new Float32Array(vectors[idx0]),
    new Float32Array(vectors[idx1 === idx0 ? (idx0 + 1) % vectors.length : idx1]),
  ];

  let assignments = new Array(vectors.length).fill(0);

  for (let iter = 0; iter < 10; iter++) {
    // Assign each vector to nearest centroid
    const newAssignments = vectors.map((v) => {
      const sim0 = cosineSimilarity(v, centroids[0]);
      const sim1 = cosineSimilarity(v, centroids[1]);
      return sim1 > sim0 ? 1 : 0;
    });

    // Check convergence
    const changed = newAssignments.some((a, i) => a !== assignments[i]);
    assignments = newAssignments;

    if (!changed) break;

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length === 0) continue;
      const newCentroid = new Float32Array(VECTOR_DIM);
      for (const m of members) {
        for (let d = 0; d < VECTOR_DIM; d++) {
          newCentroid[d] += m[d];
        }
      }
      for (let d = 0; d < VECTOR_DIM; d++) {
        newCentroid[d] /= members.length;
      }
      centroids[c] = newCentroid;
    }
  }

  // Generate labels from filenames in each cluster
  const cluster0Files = nodeFiles.filter((_, i) => assignments[i] === 0);
  const cluster1Files = nodeFiles.filter((_, i) => assignments[i] === 1);

  // Handle edge case: if one cluster is empty, don't split
  if (cluster0Files.length === 0 || cluster1Files.length === 0) return;

  const label0 = generateLabel(
    cluster0Files.map((f) => f.original_name as string),
  );
  const label1 = generateLabel(
    cluster1Files.map((f) => f.original_name as string),
  );

  // Ensure labels are unique by appending index if needed
  const finalLabel0 = label0 === label1 ? `${label0} A` : label0;
  const finalLabel1 = label0 === label1 ? `${label1} B` : label1;

  // Create 2 child nodes
  const childId0 = uuidv7();
  const childId1 = uuidv7();

  await taxTable.add([
    {
      id: childId0,
      label: finalLabel0,
      parent_id: nodeId,
      centroid_vector: Array.from(centroids[0]),
      item_count: cluster0Files.length,
    },
    {
      id: childId1,
      label: finalLabel1,
      parent_id: nodeId,
      centroid_vector: Array.from(centroids[1]),
      item_count: cluster1Files.length,
    },
  ]);

  // Rebuild nodesById with new children
  nodesById.set(childId0, {
    id: childId0,
    label: finalLabel0,
    parentId: nodeId,
    centroidVector: centroids[0],
    itemCount: cluster0Files.length,
  });
  nodesById.set(childId1, {
    id: childId1,
    label: finalLabel1,
    parentId: nodeId,
    centroidVector: centroids[1],
    itemCount: cluster1Files.length,
  });

  // Reassign files to child nodes
  const path0 = buildTaxonomyPath(childId0, nodesById);
  const path1 = buildTaxonomyPath(childId1, nodesById);

  for (let i = 0; i < nodeFiles.length; i++) {
    const fileId = nodeFiles[i].id as string;
    const newPath = assignments[i] === 0 ? path0 : path1;
    await filesTable.update({
      where: `id = '${fileId}'`,
      values: { taxonomy_path: newPath },
    });
  }

  // Mark original node as branch (item_count = 0)
  await taxTable.update({
    where: `id = '${nodeId}'`,
    values: { item_count: 0 },
  });
}

/**
 * Get the full taxonomy tree.
 * Returns the root node with nested children, or null if no taxonomy exists.
 */
export async function getTaxonomyTree(
  opts: { wsPath: string },
): Promise<TaxonomyTreeNode | null> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");

  const db = await createDatabase(dbPath);
  const taxTable = await getTaxonomyTable(db);

  const rawNodes = await taxTable.query().toArray();
  if (rawNodes.length === 0) return null;

  const nodes = rawNodes.map((r) =>
    toTaxonomyNode(r as Record<string, unknown>),
  );

  // Build tree
  const treeNodes = new Map<string, TaxonomyTreeNode>();
  for (const node of nodes) {
    treeNodes.set(node.id, {
      id: node.id,
      label: node.label,
      parentId: node.parentId,
      itemCount: node.itemCount,
    });
  }

  // Attach children
  let root: TaxonomyTreeNode | null = null;
  for (const node of treeNodes.values()) {
    if (node.parentId) {
      const parent = treeNodes.get(node.parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      }
    } else {
      root = node;
    }
  }

  return root;
}

/**
 * Rebuild the entire taxonomy from scratch.
 * Drops all taxonomy nodes and re-assigns every non-deleted parent file.
 */
export async function rebuildTaxonomy(
  opts: { wsPath: string; embedder?: unknown },
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);

    // Drop taxonomy table if it exists
    const tableNames = await db.tableNames();
    if (tableNames.includes(TAXONOMY_TABLE)) {
      await db.dropTable(TAXONOMY_TABLE);
    }

    // Recreate it empty
    await db.createEmptyTable(TAXONOMY_TABLE, buildTaxonomySchema());

    const filesTable = await getFilesTable(db, wsPath);

    // Get all non-deleted parent files
    const allFiles = await filesTable
      .query()
      .where("deleted_at IS NULL AND parent_id IS NULL AND status = 'embedded'")
      .toArray();

    // Release lock before re-assigning (assignToTaxonomy acquires its own lock)
    await release();

    // Re-assign each file
    for (const rawFile of allFiles) {
      const file = rawFile as Record<string, unknown>;
      const vector =
        file.vector instanceof Float32Array
          ? file.vector
          : new Float32Array(file.vector as ArrayLike<number>);
      await assignToTaxonomy(vector, file.id as string, file.original_name as string, {
        wsPath,
      });
    }
  } catch (err) {
    try {
      await release();
    } catch {
      /* already released */
    }
    throw err;
  }
}

/**
 * Merge nodes with item_count < 2 back into their parent.
 * Called by gc() to clean up sparse taxonomy branches.
 */
export async function mergeEmptyNodes(
  opts: { wsPath: string },
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const taxTable = await getTaxonomyTable(db);
    const filesTable = await getFilesTable(db, wsPath);

    const rawNodes = await taxTable.query().toArray();
    const nodes = rawNodes.map((r) =>
      toTaxonomyNode(r as Record<string, unknown>),
    );
    const nodesById = new Map(nodes.map((n) => [n.id, n]));

    // Find leaf nodes with item_count < 2 that have a parent
    const parentIds = new Set(
      nodes.filter((n) => n.parentId).map((n) => n.parentId!),
    );
    const emptyLeaves = nodes.filter(
      (n) => n.itemCount < 2 && n.parentId && !parentIds.has(n.id),
    );

    for (const node of emptyLeaves) {
      const parent = nodesById.get(node.parentId!);
      if (!parent) continue;

      // Build the old path for this node's files
      const oldPath = buildTaxonomyPath(node.id, nodesById);
      const oldPathStr = oldPath.join("/");

      // Build the parent path
      const parentPath = buildTaxonomyPath(parent.id, nodesById);

      // Find files assigned to this node
      const allFiles = await filesTable
        .query()
        .where("deleted_at IS NULL AND parent_id IS NULL")
        .toArray();

      for (const rawFile of allFiles) {
        const file = rawFile as Record<string, unknown>;
        let fileTaxPath: string[] = [];
        const tp = file.taxonomy_path;
        if (
          tp != null &&
          typeof tp === "object" &&
          "toArray" in (tp as object)
        ) {
          fileTaxPath = Array.from(
            (tp as { toArray(): unknown[] }).toArray(),
          ) as string[];
        } else if (Array.isArray(tp)) {
          fileTaxPath = tp as string[];
        }
        if (fileTaxPath.join("/") === oldPathStr) {
          await filesTable.update({
            where: `id = '${file.id as string}'`,
            values: { taxonomy_path: parentPath },
          });
        }
      }

      // Update parent's item_count
      await taxTable.update({
        where: `id = '${parent.id}'`,
        values: { item_count: parent.itemCount + node.itemCount },
      });

      // Delete the empty node
      await taxTable.delete(`id = '${node.id}'`);

      // Update local map
      nodesById.delete(node.id);
      nodesById.set(parent.id, {
        ...parent,
        itemCount: parent.itemCount + node.itemCount,
      });
    }
  } finally {
    await release();
  }
}
