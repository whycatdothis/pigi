; Definitions shared by the JavaScript, TypeScript and TSX grammars.
; Derived from tree-sitter-javascript v0.25.0 queries/tags.scm (MIT).

(method_definition name: (property_identifier) @name) @definition.method
(class name: (_) @name) @definition.class
(class_declaration name: (_) @name) @definition.class
(function_expression name: (identifier) @name) @definition.function
(function_declaration name: (identifier) @name) @definition.function
(generator_function name: (identifier) @name) @definition.function
(generator_function_declaration name: (identifier) @name) @definition.function

(variable_declarator
  name: (identifier) @name
  value: [(arrow_function) (function_expression)]) @definition.function

(assignment_expression
  left: [
    (identifier) @name
    (member_expression property: (property_identifier) @name)
  ]
  right: [(arrow_function) (function_expression)]) @definition.function

(pair
  key: (property_identifier) @name
  value: [(arrow_function) (function_expression)]) @definition.function

; Any module-level binding: constants, `memo(...)`, `styled.div`, stores.
(program (lexical_declaration (variable_declarator name: (identifier) @name) @definition.variable))
(program (variable_declaration (variable_declarator name: (identifier) @name) @definition.variable))
(export_statement
  declaration: (lexical_declaration (variable_declarator name: (identifier) @name) @definition.variable))
(export_statement
  declaration: (variable_declaration (variable_declarator name: (identifier) @name) @definition.variable))
