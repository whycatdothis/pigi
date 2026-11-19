; Derived from tree-sitter-typescript v0.23.2 queries/tags.scm (MIT).

(function_signature name: (identifier) @name) @definition.function
(method_signature name: (property_identifier) @name) @definition.method
(abstract_method_signature name: (property_identifier) @name) @definition.method
(abstract_class_declaration name: (type_identifier) @name) @definition.class
(module name: (identifier) @name) @definition.module
(internal_module name: (identifier) @name) @definition.module
(interface_declaration name: (type_identifier) @name) @definition.interface
(type_alias_declaration name: (type_identifier) @name) @definition.type
(enum_declaration name: (identifier) @name) @definition.enum
(public_field_definition name: [(property_identifier) (private_property_identifier)] @name) @definition.field
(property_signature name: (property_identifier) @name) @definition.field
