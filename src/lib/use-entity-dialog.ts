import { useState } from "react";

/**
 * Estado de un diálogo de alta/edición: `open()` para crear, `open(entity)` para editar.
 * La entidad se conserva al cerrar para que el contenido no "salte" durante la animación.
 */
export function useEntityDialog<T>() {
  const [isOpen, setIsOpen] = useState(false);
  const [entity, setEntity] = useState<T | null>(null);
  return {
    isOpen,
    entity,
    open: (value: T | null = null) => {
      setEntity(value);
      setIsOpen(true);
    },
    close: () => setIsOpen(false),
  };
}
