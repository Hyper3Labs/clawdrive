import { useState } from "react";
import { TaxonomySidebar } from "./TaxonomySidebar";
import { FileGrid } from "./FileGrid";
import { Breadcrumb } from "./Breadcrumb";
import { FilePreview } from "./FilePreview";

export function TaxonomyBrowser() {
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* Sidebar */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.1)",
          overflowY: "auto",
        }}
      >
        <TaxonomySidebar selectedPath={selectedPath} onSelect={setSelectedPath} />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <Breadcrumb path={selectedPath} onNavigate={setSelectedPath} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <FileGrid selectedPath={selectedPath} onFileClick={setPreviewFileId} />
        </div>
      </div>

      {/* File preview panel */}
      {previewFileId && (
        <FilePreview fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      )}
    </div>
  );
}
