; From tree-sitter-python v0.25.0 queries/tags.scm (MIT).

(module (expression_statement (assignment left: (identifier) @name) @definition.constant))
(class_definition name: (identifier) @name) @definition.class
(function_definition name: (identifier) @name) @definition.function
