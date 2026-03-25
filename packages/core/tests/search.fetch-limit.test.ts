import { describe, expect, it, vi, beforeEach } from "vitest";

const createDatabaseMock = vi.fn();
const getFilesTableMock = vi.fn();

vi.mock("../src/storage/db.js", () => ({
  createDatabase: createDatabaseMock,
  getFilesTable: getFilesTableMock,
}));

const { search } = await import("../src/search.js");

function makeRow(id: string, parentId: string | null, file: string): Record<string, unknown> {
  return {
    id,
    parent_id: parentId,
    original_name: file,
    content_type: "text/markdown",
    file_size: 128,
    tags: [],
    taxonomy_path: [],
    description: null,
    file_path: file,
    _distance: 0.1,
  };
}

describe("search fetch widening", () => {
  beforeEach(() => {
    createDatabaseMock.mockReset();
    getFilesTableMock.mockReset();
  });

  it("widens the raw hit window when chunk deduplication would under-fill the result limit", async () => {
    const requestedLimits: number[] = [];
    const firstWindow = [
      ...Array.from({ length: 25 }, (_, index) => makeRow(`alpha-${index}`, "alpha-parent", "alpha.pdf")),
      ...Array.from({ length: 25 }, (_, index) => makeRow(`beta-${index}`, "beta-parent", "beta.pdf")),
    ];
    const expandedWindow = [
      ...firstWindow,
      makeRow("gamma-parent", null, "gamma.md"),
    ];

    const table = {
      vectorSearch: () => ({
        distanceType: () => ({
          where: () => ({
            limit: (value: number) => ({
              toArray: async () => {
                requestedLimits.push(value);
                return value <= 50 ? firstWindow : expandedWindow;
              },
            }),
          }),
        }),
      }),
    };

    createDatabaseMock.mockResolvedValue({});
    getFilesTableMock.mockResolvedValue(table);

    const embedder = {
      dimensions: 3072,
      modelId: "model-a",
      async embed(): Promise<Float32Array> {
        return new Float32Array(3072);
      },
    };

    const results = await search(
      { query: "mission", limit: 3 },
      { wsPath: "/tmp/workspace", embedder },
    );

    expect(requestedLimits).toEqual([50, 100]);
    expect(results.map((result) => result.file)).toEqual(["alpha.pdf", "beta.pdf", "gamma.md"]);
  });
});