use serde::Serialize;
use serde_json::Value;
use ts_rs::TS;

#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct UpdaterStatus {
    pub configured: bool,
    pub version: String,
}

pub(crate) fn is_configured(config: Option<&Value>) -> bool {
    let Some(config) = config else {
        return false;
    };
    let has_key = config
        .get("pubkey")
        .and_then(Value::as_str)
        .is_some_and(|key| !key.trim().is_empty());
    let has_endpoints = config
        .get("endpoints")
        .and_then(Value::as_array)
        .is_some_and(|endpoints| {
            !endpoints.is_empty()
                && endpoints.iter().all(|endpoint| {
                    endpoint
                        .as_str()
                        .and_then(|endpoint| tauri::Url::parse(endpoint).ok())
                        .is_some_and(|url| {
                            url.scheme() == "https"
                                && url.host_str().is_some()
                                && url.username().is_empty()
                                && url.password().is_none()
                        })
                })
        });
    has_key && has_endpoints
}

#[tauri::command]
pub fn updater_status(app: tauri::AppHandle) -> UpdaterStatus {
    UpdaterStatus {
        configured: is_configured(app.config().plugins.0.get("updater")),
        version: app.package_info().version.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn requires_a_key_and_https_endpoints() {
        assert!(!is_configured(None));
        assert!(!is_configured(Some(
            &json!({"pubkey": "", "endpoints": []})
        )));
        assert!(!is_configured(Some(&json!({
            "pubkey": "public-key", "endpoints": ["http://updates.example.com/latest.json"]
        }))));
        assert!(!is_configured(Some(&json!({
            "pubkey": "public-key", "endpoints": ["https://user:password@updates.example.com/latest.json"]
        }))));
        assert!(is_configured(Some(&json!({
            "pubkey": "public-key", "endpoints": ["https://updates.example.com/latest.json"]
        }))));
    }
}
