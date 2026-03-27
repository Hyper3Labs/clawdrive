import { useEffect, useState } from "react";
import { getTaxonomy, listFiles } from "../../api";
import type { TaxonomyNode } from "../../types";

function getTotalCount(node: TaxonomyNode): number {
  if (!node.children || node.children.length === 0) return node.itemCount;
  return node.children.reduce((sum, child) => sum + getTotalCount(child), 0);
}

interface TaxonomySidebarProps {
  selectedPath: string[];
  onSelect: (path: string[]) => void;
}

export function TaxonomySidebar({ selectedPath, onSelect }: TaxonomySidebarProps) {
  const [tree, setTree] = useState<TaxonomyNode[]>([]);
  const [fileTotal, setFileTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTaxonomy(),
      listFiles({ limit: 1 }),
    ])
      .then(([taxRes, filesRes]: [TaxonomyNode | TaxonomyNode[] | null, { total?: number }]) => {
        if (!taxRes) setTree([]);
        else if (Array.isArray(taxRes)) setTree(taxRes);
        else setTree([taxRes]);

        if (typeof filesRes.total === "number") setFileTotal(filesRes.total);
      })
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 16, opacity: 0.4, fontSize: 13 }}>Loading taxonomy...</div>
    );
  }

  if (tree.length === 0) {
    return (
      <div style={{ padding: 16, opacity: 0.4, fontSize: 13 }}>No taxonomy data</div>
    );
  }

  return (
    <div style={{ padding: "8px 0" }}>
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          parentPath={[]}
          overrideCount={fileTotal}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: TaxonomyNode;
  depth: number;
  selectedPath: string[];
  onSelect: (path: string[]) => void;
  parentPath: string[];
  overrideCount?: number | null;
}

function TreeNode({ node, depth, selectedPath, onSelect, parentPath, overrideCount }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const currentPath = [...parentPath, node.label];
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedPath.join("/") === currentPath.join("/");

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 12px",
          paddingLeft: 12 + depth * 16,
          cursor: "pointer",
          background: isSelected ? "rgba(99,102,241,0.15)" : "transparent",
          transition: "background 0.1s",
          fontSize: 13,
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "transparent";
        }}
        onClick={() => onSelect(currentPath)}
      >
        <span
          style={{
            width: 16,
            textAlign: "center",
            fontSize: 10,
            opacity: hasChildren ? 0.5 : 0,
            cursor: hasChildren ? "pointer" : "default",
            userSelect: "none",
            transition: "transform 0.15s",
            display: "inline-block",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              setExpanded(!expanded);
            }
          }}
        >
          {"\u25B6"}
        </span>
        <span style={{ flex: 1, color: isSelected ? "#e4e4e7" : "rgba(255,255,255,0.7)" }}>
          {node.label}
        </span>
        <span style={{ fontSize: 11, opacity: 0.35, marginLeft: 8 }}>{overrideCount ?? getTotalCount(node)}</span>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              parentPath={currentPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
