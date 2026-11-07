//! PDF page mutations and fingerprints, independent of the desktop transport.

use anyhow::{bail, Context, Result};
use lopdf::{dictionary, Document, Object, ObjectId};
use std::collections::BTreeMap;

/// Delete a page from PDF bytes using native lopdf parser and serializer
pub(crate) fn delete_page(pdf_bytes: &[u8], page_number: u32) -> Result<Vec<u8>> {
    let mut doc = Document::load_mem(pdf_bytes).context("Failed to parse PDF")?;
    let pages = doc.get_pages();
    let page_count = pages.len();
    if page_count <= 1 {
        bail!("A PDF must keep at least one page.");
    }
    if page_number < 1 || page_number > page_count as u32 {
        bail!("Page {page_number} does not exist.");
    }

    doc.delete_pages(&[page_number]);

    let mut output = Vec::new();
    doc.save_to(&mut output).context("Failed to save PDF")?;
    Ok(output)
}

/// Insert a blank page after the target page with identical dimensions and rotation
pub(crate) fn insert_blank_page_after(pdf_bytes: &[u8], page_number: u32) -> Result<Vec<u8>> {
    let mut doc = Document::load_mem(pdf_bytes).context("Failed to parse PDF")?;
    let pages: BTreeMap<u32, ObjectId> = doc.get_pages();
    let page_count = pages.len();
    if page_number < 1 || page_number > page_count as u32 {
        bail!("Page {page_number} does not exist.");
    }

    let target_page_id = *pages
        .get(&page_number)
        .ok_or_else(|| anyhow::anyhow!("Page {page_number} not found"))?;

    let (parent_id, media_box, crop_box, rotate) = {
        let page_obj = doc
            .objects
            .get(&target_page_id)
            .context("Target page object missing")?;
        let page_dict = page_obj
            .as_dict()
            .context("Target page is not a dictionary")?;

        let parent = page_dict
            .get(b"Parent")
            .and_then(Object::as_reference)
            .context("Target page missing Parent reference")?;

        let media = page_dict
            .get(b"MediaBox")
            .cloned()
            .unwrap_or_else(|_| Object::Array(vec![0.into(), 0.into(), 595.into(), 842.into()]));

        let crop = page_dict.get(b"CropBox").cloned().ok();
        let rot = page_dict.get(b"Rotate").cloned().ok();

        (parent, media, crop, rot)
    };

    let new_page_id = doc.new_object_id();
    let mut new_page_dict = dictionary! {
        "Type" => "Page",
        "Parent" => parent_id,
        "MediaBox" => media_box,
        "Resources" => dictionary! {},
    };

    if let Some(crop) = crop_box {
        new_page_dict.set("CropBox", crop);
    }
    if let Some(rot) = rotate {
        new_page_dict.set("Rotate", rot);
    }

    doc.objects
        .insert(new_page_id, Object::Dictionary(new_page_dict));

    // Insert new page into Parent Kids array after target_page_id
    let mut current_parent_ref = Ok(parent_id);
    let mut is_direct_parent = true;

    while let Ok(current_id) = current_parent_ref {
        if let Some(page_tree) = doc
            .objects
            .get_mut(&current_id)
            .and_then(|pt| pt.as_dict_mut().ok())
        {
            if is_direct_parent {
                if let Ok(kids) = page_tree.get_mut(b"Kids").and_then(Object::as_array_mut) {
                    let insert_pos = kids
                        .iter()
                        .position(|k| match k {
                            Object::Reference(id) => *id == target_page_id,
                            _ => false,
                        })
                        .map(|pos| pos + 1)
                        .unwrap_or(kids.len());

                    kids.insert(insert_pos, Object::Reference(new_page_id));
                }
                is_direct_parent = false;
            }

            if let Ok(count) = page_tree.get(b"Count").and_then(Object::as_i64) {
                page_tree.set("Count", count + 1);
            }

            current_parent_ref = page_tree.get(b"Parent").and_then(Object::as_reference);
        } else {
            break;
        }
    }

    let mut output = Vec::new();
    doc.save_to(&mut output).context("Failed to save PDF")?;
    Ok(output)
}

/// Fast native SHA-256 fingerprint of PDF document bytes
pub(crate) fn fingerprint(pdf_bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(pdf_bytes);
    let result = hasher.finalize();
    format!("{result:x}")
}

#[cfg(test)]
mod tests;
