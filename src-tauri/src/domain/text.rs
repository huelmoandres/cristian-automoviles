//! Búsqueda de texto: sin distinguir mayúsculas ni tildes, todas las palabras en cualquier orden.
//! Se usa en Rust y también desde SQL (ver `SQL_MATCH_FN`, registrada en `db::configure`).

/// Nombre de la función SQL `matches_search(query, campo1, campo2, ...)`.
pub const SQL_MATCH_FN: &str = "matches_search";

fn fold(c: char) -> char {
    match c {
        'á' | 'à' | 'ä' | 'â' | 'ã' => 'a',
        'é' | 'è' | 'ë' | 'ê' => 'e',
        'í' | 'ì' | 'ï' | 'î' => 'i',
        'ó' | 'ò' | 'ö' | 'ô' | 'õ' => 'o',
        'ú' | 'ù' | 'ü' | 'û' => 'u',
        'ñ' => 'n',
        'ç' => 'c',
        other => other,
    }
}

/// "Pérez Núñez" → "perez nunez".
pub fn normalize(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(fold)
        .collect()
}

/// `true` si cada palabra de `query` aparece en alguno de los campos.
/// Una búsqueda vacía coincide con todo.
pub fn matches_all<'a>(query: &str, fields: impl IntoIterator<Item = &'a str>) -> bool {
    let haystack = fields
        .into_iter()
        .map(normalize)
        .collect::<Vec<_>>()
        .join(" ");
    normalize(query)
        .split_whitespace()
        .all(|word| haystack.contains(word))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_removes_case_and_accents() {
        assert_eq!(normalize("Pérez NÚÑEZ"), "perez nunez");
    }

    #[test]
    fn matches_every_word_in_any_order() {
        let fields = ["Andrés", "Huelmo", "46801321"];
        assert!(matches_all("huelmo andres", fields));
        assert!(matches_all("ANDRÉS", fields));
        assert!(matches_all("4680", fields));
        assert!(matches_all("", fields));
        assert!(!matches_all("huelmo garcia", fields));
    }
}
