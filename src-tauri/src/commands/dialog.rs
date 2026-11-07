use std::sync::atomic::{AtomicBool, Ordering};

pub(super) static IS_PDF_DIALOG_OPEN: AtomicBool = AtomicBool::new(false);
pub(super) static IS_IMAGE_DIALOG_OPEN: AtomicBool = AtomicBool::new(false);
pub(super) static IS_SAVE_PDF_DIALOG_OPEN: AtomicBool = AtomicBool::new(false);
pub(super) static IS_SAVE_JSON_DIALOG_OPEN: AtomicBool = AtomicBool::new(false);
pub(super) static IS_JSON_DIALOG_OPEN: AtomicBool = AtomicBool::new(false);
pub(super) static IS_DIRECTORY_DIALOG_OPEN: AtomicBool = AtomicBool::new(false);

pub(super) struct DialogGuard<'a>(&'a AtomicBool);

impl<'a> DialogGuard<'a> {
    pub(super) fn try_acquire(flag: &'a AtomicBool) -> Option<Self> {
        if flag.swap(true, Ordering::SeqCst) {
            None
        } else {
            Some(Self(flag))
        }
    }
}

impl<'a> Drop for DialogGuard<'a> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
