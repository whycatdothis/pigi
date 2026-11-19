; Definitions from rgctl's crates/rgctl-lang-perl/queries/tags.scm (MIT),
; plus `use constant` and Moose/Moo `has`.

(package_statement name: (package) @name) @definition.module
(subroutine_declaration_statement name: (bareword) @name) @definition.function
(method_declaration_statement name: (bareword) @name) @definition.function

((use_statement
  module: (package) @_module
  (list_expression . (autoquoted_bareword) @name)) @definition.constant
  (#eq? @_module "constant"))

((use_statement
  module: (package) @_module
  (anonymous_hash_expression (list_expression (autoquoted_bareword) @name))) @definition.constant
  (#eq? @_module "constant"))

((ambiguous_function_call_expression
  function: (function) @_function
  arguments: (list_expression . (autoquoted_bareword) @name)) @definition.field
  (#eq? @_function "has"))
