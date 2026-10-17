enum TaskType { expression, equation, word, simplify }

enum Difficulty { easy, medium, hard }

/// One exercise. Besides the text shown to the student it carries a
/// machine-checkable form (expr / equation / solutionExpr) so the answer can be
/// verified instead of trusted.
class MathTask {
  const MathTask({
    required this.type,
    required this.difficulty,
    required this.question,
    required this.answer,
    this.expr,
    this.equation,
    this.variable,
    this.solutionExpr,
    this.unit,
  });

  final TaskType type;
  final Difficulty difficulty;
  final String question;

  /// A number ("12450", "-3/4", "2,5") or, for [TaskType.simplify], an expression ("5a − 3").
  final String answer;

  /// expression: the expression to evaluate; simplify: the expression to simplify.
  final String? expr;

  /// equation: e.g. "x + 309 = 2542", with [variable] = "x".
  final String? equation;
  final String? variable;

  /// word: an expression that gives the answer.
  final String? solutionExpr;
  final String? unit;

  /// Parses one task from JSON; throws [FormatException] when a field is missing.
  factory MathTask.fromJson(Map<String, dynamic> json) {
    T pick<T extends Enum>(List<T> values, Object? name) => values.firstWhere(
          (v) => v.name == name,
          orElse: () => throw FormatException('unknown value "$name"'),
        );
    String? str(String key) {
      final v = json[key];
      return v == null || '$v'.trim().isEmpty ? null : '$v'.trim();
    }

    return MathTask(
      type: pick(TaskType.values, json['type']),
      difficulty: pick(Difficulty.values, json['difficulty']),
      question: str('question') ?? (throw const FormatException('no question')),
      answer: str('answer') ?? (throw const FormatException('no answer')),
      expr: str('expr'),
      equation: str('equation'),
      variable: str('variable'),
      solutionExpr: str('solution_expr'),
      unit: str('unit'),
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'difficulty': difficulty.name,
        'question': question,
        'answer': answer,
        if (expr != null) 'expr': expr,
        if (equation != null) 'equation': equation,
        if (variable != null) 'variable': variable,
        if (solutionExpr != null) 'solution_expr': solutionExpr,
        if (unit != null) 'unit': unit,
      };
}
