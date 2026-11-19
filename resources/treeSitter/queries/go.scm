; Derived from tree-sitter-go v0.25.0 queries/tags.scm (MIT).

(function_declaration name: (identifier) @name) @definition.function
(method_declaration name: (field_identifier) @name) @definition.method
(type_spec name: (type_identifier) @name) @definition.type
(type_alias name: (type_identifier) @name) @definition.type
(field_declaration name: (field_identifier) @name) @definition.field
(method_elem name: (field_identifier) @name) @definition.method
(source_file (var_declaration (var_spec name: (identifier) @name) @definition.variable))
(source_file (var_declaration (var_spec_list (var_spec name: (identifier) @name) @definition.variable)))
(source_file (const_declaration (const_spec name: (identifier) @name) @definition.constant))
