import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import '../data/models.dart';
import 'task.dart';

const _type = {
  TaskType.expression: 'вычисли',
  TaskType.equation: 'уравнение',
  TaskType.word: 'задача',
  TaskType.simplify: 'упрости',
};
const _difficulty = {
  Difficulty.easy: 'легко',
  Difficulty.medium: 'средне',
  Difficulty.hard: 'сложно',
  Difficulty.expert: 'максимум',
};

/// A topic's unsolved tasks with room to solve, and the answers on the last
/// page (same layout as web/src/lib/pdf.tsx).
Future<Uint8List> buildTopicPdf(Topic topic, List<StoredTask> tasks, {required String Function(MathTask) answerText}) async {
  // DejaVu Sans covers Cyrillic, superscripts (x²) and the signs · − × used in tasks.
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/DejaVuSans-Bold.ttf'));
  final theme = pw.ThemeData.withFont(base: regular, bold: bold);
  final date = DateTime.now();
  final dateText = '${date.day.toString().padLeft(2, '0')}.${date.month.toString().padLeft(2, '0')}.${date.year}';
  final muted = pw.TextStyle(fontSize: 9, color: PdfColors.grey700);

  final doc = pw.Document(title: '${topic.title} — задания', author: 'Math Trainer', theme: theme);
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(40),
    build: (_) => [
      pw.Text(topic.title, style: pw.TextStyle(fontSize: 16, fontWeight: pw.FontWeight.bold)),
      pw.Text('${topic.bookTitle} · ${topic.source}', style: muted),
      pw.Text('Нерешённых заданий: ${tasks.length} · $dateText', style: muted),
      for (final (i, s) in tasks.indexed)
        pw.Container(
          margin: const pw.EdgeInsets.only(top: 14),
          child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
            pw.Text('${_type[s.task.type]} · ${_difficulty[s.task.difficulty]}', style: muted.copyWith(fontSize: 8)),
            pw.Text('${i + 1}. ${s.task.question}', style: const pw.TextStyle(fontSize: 11, lineSpacing: 2)),
            pw.Container(
              height: 46,
              decoration: const pw.BoxDecoration(
                border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey400, width: 0.5, style: pw.BorderStyle.dashed)),
              ),
            ),
          ]),
        ),
    ],
  ));
  doc.addPage(pw.MultiPage(
    pageFormat: PdfPageFormat.a4,
    margin: const pw.EdgeInsets.all(40),
    build: (_) => [
      pw.Text('Ответы — ${topic.title}', style: pw.TextStyle(fontSize: 14, fontWeight: pw.FontWeight.bold)),
      pw.SizedBox(height: 8),
      for (final (i, s) in tasks.indexed)
        pw.Padding(padding: const pw.EdgeInsets.only(top: 4), child: pw.Text('${i + 1}. ${answerText(s.task)}')),
    ],
  ));
  return doc.save();
}

/// Writes the PDF to a temporary file and opens the system share sheet.
Future<void> shareTopicPdf(Topic topic, Uint8List bytes, {Rect? origin}) async {
  final name = '${topic.title.replaceAll(RegExp(r'[\\/:*?"<>|]+'), '')} — задания.pdf';
  final file = File('${(await getTemporaryDirectory()).path}/${name.length > 80 ? '${name.substring(0, 70)}.pdf' : name}');
  await file.writeAsBytes(bytes);
  await SharePlus.instance.share(ShareParams(
    files: [XFile(file.path, mimeType: 'application/pdf')],
    subject: '${topic.title} — задания',
    sharePositionOrigin: origin, // iPad: where the share popover points
  ));
}
