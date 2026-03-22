use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size_bytes: u64,
    pub hash: String,
    pub path: PathBuf,
    pub tags: Vec<String>,
    pub embedding: Option<Vec<f32>>,
}

pub struct FileStore {
    entries: HashMap<String, FileEntry>,
}

impl FileStore {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    pub fn insert(&mut self, entry: FileEntry) -> Option<FileEntry> {
        self.entries.insert(entry.id.clone(), entry)
    }

    pub fn get(&self, id: &str) -> Option<&FileEntry> {
        self.entries.get(id)
    }

    pub fn search_by_tag(&self, tag: &str) -> Vec<&FileEntry> {
        self.entries
            .values()
            .filter(|e| e.tags.iter().any(|t| t == tag))
            .collect()
    }

    pub fn list_by_type(&self, mime_type: &str) -> Vec<&FileEntry> {
        self.entries
            .values()
            .filter(|e| e.mime_type == mime_type)
            .collect()
    }

    pub fn total_size(&self) -> u64 {
        self.entries.values().map(|e| e.size_bytes).sum()
    }
}
