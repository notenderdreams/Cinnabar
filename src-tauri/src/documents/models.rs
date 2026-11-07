use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;

#[derive(Serialize, Deserialize, Clone, Type)]
pub struct OpenFileResult {
    pub file_name: String,
    pub file_path: String,
    pub data: Vec<u8>,
}

#[derive(Serialize, Deserialize, Clone, Type)]
pub struct OpenImageResult {
    pub file_name: String,
    pub file_path: String,
    pub data_url: String,
}

#[derive(Serialize, Deserialize, Clone, Type)]
pub struct SaveResult {
    pub success: bool,
    pub file_path: Option<String>,
}

impl SaveResult {
    pub(crate) fn failed() -> Self {
        Self {
            success: false,
            file_path: None,
        }
    }

    pub(crate) fn saved(path: &Path) -> Self {
        Self {
            success: true,
            file_path: Some(path.to_string_lossy().into_owned()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Type)]
pub struct ScannedPdfResult {
    pub file_name: String,
    pub file_path: String,
    #[specta(type = f64)]
    pub file_size: u64,
    #[specta(type = f64)]
    pub modified_timestamp: u64,
    pub directory_path: String,
    pub num_pages: Option<u32>,
}
