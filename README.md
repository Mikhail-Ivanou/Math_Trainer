# Math Trainer

Тренажёр примеров для школьника. Начинаем с математики 5 класса.

- **Клиент:** Flutter. В основном для Android, проверяем на симуляторе iOS.
- **Данные и вход:** Firebase (Firestore + Firebase Auth).
- **Источник заданий:** учебник «Математика. 5 класс. Часть 1» (Герасимов, Пирютко,
  Лобанов, 2025) с портала Академии образования
  [e-padruchnik.adu.by](https://e-padruchnik.adu.by/), используется для RAG.

## Учебник

PDF не хранится в репозитории: на нём стоит пометка «все права защищены».
Скачать его можно в `data/`, эта папка в .gitignore:

```bash
mkdir -p data && curl -f -X POST -F id=1149 -F getbook= -o data/Matematika_5kl_ch1_Gerasimov_rus_2025.pdf https://e-padruchnik.adu.by/
```

Вторая часть учебника лежит на том же портале под `id=1175`.
