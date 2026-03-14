use crate::error::AppError;
use std::path::{Path, PathBuf};

/// Canonicalize `path` and verify it falls under the user's home directory.
/// Rejects paths outside $HOME (e.g. /etc/, /usr/).
pub fn confine_path(path: &str) -> Result<PathBuf, AppError> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Other("Cannot resolve home directory".into()))?;

    // Expand ~ prefix
    let expanded = if path.starts_with("~/") {
        home.join(&path[2..])
    } else {
        PathBuf::from(path)
    };

    // Canonicalize — resolves symlinks, .., etc.
    // For paths that don't exist yet, canonicalize the longest existing ancestor.
    let canonical = canonicalize_best_effort(&expanded)?;

    if !canonical.starts_with(&home) {
        return Err(AppError::Other(format!(
            "Path traversal denied: '{}' is outside the home directory",
            path
        )));
    }

    Ok(canonical)
}

/// Canonicalize as much of the path as exists, then append the remaining
/// non-existent segments. This handles paths where the leaf doesn't exist yet
/// (e.g. creating a new file).
fn canonicalize_best_effort(path: &Path) -> Result<PathBuf, AppError> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|e| AppError::Other(format!("Failed to canonicalize '{}': {e}", path.display())));
    }

    // Walk up to find the first existing ancestor
    let mut existing = path.to_path_buf();
    let mut tail_parts: Vec<std::ffi::OsString> = Vec::new();

    loop {
        if existing.exists() {
            break;
        }
        match existing.file_name() {
            Some(part) => {
                let owned = part.to_os_string();
                tail_parts.push(owned);
                if !existing.pop() {
                    break;
                }
            }
            None => break,
        }
    }

    let mut result = existing
        .canonicalize()
        .map_err(|e| AppError::Other(format!("Failed to canonicalize '{}': {e}", existing.display())))?;

    // Append the non-existent tail segments in reverse order
    for part in tail_parts.iter().rev() {
        // Reject ".." in non-existent segments
        if part == ".." {
            return Err(AppError::Other(
                "Path traversal denied: '..' in non-existent path segment".into(),
            ));
        }
        result.push(part);
    }

    Ok(result)
}
