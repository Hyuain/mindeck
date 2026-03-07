mod commands;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // keychain
            commands::keychain::set_api_key,
            commands::keychain::get_api_key,
            commands::keychain::delete_api_key,
            // provider
            commands::provider::list_providers,
            commands::provider::save_provider,
            commands::provider::delete_provider,
            commands::provider::init_app_dirs,
            // workspace
            commands::workspace::list_workspaces,
            commands::workspace::create_workspace,
            commands::workspace::update_workspace,
            commands::workspace::delete_workspace,
            // chat
            commands::chat::load_messages,
            commands::chat::append_message,
            commands::chat::clear_messages,
            // streaming
            commands::stream::stream_chat,
            commands::stream::probe_provider,
            commands::stream::probe_url,
            commands::stream::list_provider_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
