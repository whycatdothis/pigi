; Derived from tree-sitter-java v0.23.5 queries/tags.scm (MIT).

(class_declaration name: (identifier) @name) @definition.class
(interface_declaration name: (identifier) @name) @definition.interface
(enum_declaration name: (identifier) @name) @definition.enum
(record_declaration name: (identifier) @name) @definition.class
(annotation_type_declaration name: (identifier) @name) @definition.interface
(method_declaration name: (identifier) @name) @definition.method
(enum_constant name: (identifier) @name) @definition.constant
(field_declaration declarator: (variable_declarator name: (identifier) @name)) @definition.field
(constant_declaration declarator: (variable_declarator name: (identifier) @name)) @definition.constant
