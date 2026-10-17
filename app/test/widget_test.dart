import 'package:flutter_test/flutter_test.dart';

import 'package:math/main.dart';

void main() {
  testWidgets('home screen renders without Firebase', (tester) async {
    await tester.pumpWidget(const MathTrainerApp());
    expect(find.text('Math Trainer'), findsOneWidget);
    expect(find.text('Firebase не подключён'), findsOneWidget);
  });
}
