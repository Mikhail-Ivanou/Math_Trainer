/** PDF of a topic's unsolved tasks, with the answers on a separate last page. */
import { Document, Font, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { formatAnswer } from './format';
import { difficultyLabel, typeLabel, type StoredTask, type Topic } from './models';

// DejaVu Sans covers Cyrillic, superscripts (x²) and the signs · − × used in tasks.
Font.register({
  family: 'DejaVu',
  fonts: [{ src: '/fonts/DejaVuSans.ttf' }, { src: '/fonts/DejaVuSans-Bold.ttf', fontWeight: 'bold' }],
});
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { fontFamily: 'DejaVu', fontSize: 11, padding: 40, lineHeight: 1.4 },
  title: { fontSize: 16, fontWeight: 'bold' },
  muted: { fontSize: 9, color: '#555', marginTop: 2 },
  task: { marginTop: 14 },
  label: { fontSize: 8, color: '#666' },
  space: { height: 46, borderBottomWidth: 0.5, borderBottomColor: '#bbb', borderBottomStyle: 'dashed' },
  answers: { fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  answer: { marginTop: 4 },
});

export function TopicPdf({ topic, tasks, date }: { topic: Topic; tasks: StoredTask[]; date: string }) {
  const source = `${topic.bookTitle} · § ${topic.sectionNumber}. ${topic.sectionTitle}`;
  return (
    <Document title={`${topic.title} — задания`} author="Math Trainer">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{topic.title}</Text>
        <Text style={s.muted}>{source}</Text>
        <Text style={s.muted}>{`Нерешённых заданий: ${tasks.length} · ${date}`}</Text>
        {tasks.map((t, i) => (
          <View key={t.id} style={s.task} wrap={false}>
            <Text style={s.label}>{`${typeLabel[t.type]} · ${difficultyLabel[t.difficulty]}`}</Text>
            <Text>{`${i + 1}. ${t.question}`}</Text>
            <View style={s.space} />
          </View>
        ))}
      </Page>
      <Page size="A4" style={s.page}>
        <Text style={s.answers}>{`Ответы — ${topic.title}`}</Text>
        {tasks.map((t, i) => (
          <Text key={t.id} style={s.answer}>{`${i + 1}. ${formatAnswer(t.answer, t.unit)}`}</Text>
        ))}
      </Page>
    </Document>
  );
}

/** Builds the PDF and offers it to save on disk. */
export async function downloadTopicPdf(topic: Topic, tasks: StoredTask[]) {
  const date = new Date().toLocaleDateString('ru-RU');
  const blob = await pdf(<TopicPdf topic={topic} tasks={tasks} date={date} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${topic.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 60)} — задания.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
