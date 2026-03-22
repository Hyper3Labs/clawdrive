"""Hierarchical taxonomy builder for ClawDrive."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TaxonomyNode:
    name: str
    children: list[TaxonomyNode] = field(default_factory=list)
    file_ids: list[str] = field(default_factory=list)
    max_children: int = 8

    @property
    def count(self) -> int:
        return len(self.file_ids) + sum(c.count for c in self.children)

    def add_file(self, file_id: str, categories: list[str]) -> None:
        if not categories:
            self.file_ids.append(file_id)
            return

        target = categories[0]
        for child in self.children:
            if child.name == target:
                child.add_file(file_id, categories[1:])
                return

        if len(self.children) < self.max_children:
            new_node = TaxonomyNode(name=target)
            self.children.append(new_node)
            new_node.add_file(file_id, categories[1:])

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "count": self.count,
            "children": [c.to_dict() for c in self.children],
        }


def build_taxonomy(
    files: list[dict],
    categorizer,
) -> TaxonomyNode:
    root = TaxonomyNode(name="root")
    for f in files:
        categories = categorizer(f)
        root.add_file(f["id"], categories)
    return root
