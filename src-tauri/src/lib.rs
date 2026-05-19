//! Maple — a fast, transparent macOS LLM client.

mod commands;
mod db;
mod error;
mod llm;

use db::Db;
use error::Result;
use tauri::Manager;

/// Shared application state, available to every Tauri command.
pub struct AppState {
    pub db: Db,
    pub http: reqwest::Client,
}

/// Seed first-run defaults. Safe values ship in every build; the test API key
/// is only seeded in debug builds, from a gitignored file.
fn seed_defaults(db: &Db) -> Result<()> {
    if db.get_setting("base_url")?.is_none() {
        db.set_setting("base_url", "https://www.dmxapi.cn/v1")?;
    }
    if db.get_setting("default_model")?.is_none() {
        db.set_setting("default_model", "gpt-5-mini")?;
    }
    if db.get_setting("theme")?.is_none() {
        db.set_setting("theme", "dark")?;
    }

    #[cfg(debug_assertions)]
    {
        let key_missing = db
            .get_setting("api_key")?
            .map(|k| k.trim().is_empty())
            .unwrap_or(true);
        if key_missing {
            let seed_path = concat!(env!("CARGO_MANIFEST_DIR"), "/.dev-seed.json");
            if let Ok(text) = std::fs::read_to_string(seed_path) {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
                    for key in ["api_key", "base_url", "default_model"] {
                        if let Some(s) = v.get(key).and_then(|x| x.as_str()) {
                            db.set_setting(key, s)?;
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;

            let db = Db::open(&dir.join("maple.db"))?;
            seed_defaults(&db)?;

            let http = reqwest::Client::builder()
                .user_agent(concat!("Maple/", env!("CARGO_PKG_VERSION")))
                .connect_timeout(std::time::Duration::from_secs(30))
                .build()?;

            app.manage(AppState { db, http });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_conversations,
            commands::create_conversation,
            commands::rename_conversation,
            commands::delete_conversation,
            commands::get_messages,
            commands::send_message,
            commands::get_settings,
            commands::update_settings,
            commands::list_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
