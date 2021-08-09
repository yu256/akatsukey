# Linea de tiempo
タイムラインは、[ノート](./note)が時系列で表示される機能です。 タイムラインには以下で示す種類があり、種類によって表示されるノートも異なります。 なお、タイムラインの種類によってはサーバーにより無効になっている場合があります。

## Inicio
自分のフォローしているユーザーの投稿が流れます。HTLと略されます。

## Local
全てのローカルユーザーの「ホーム」指定されていない投稿が流れます。LTLと略されます。

## Social
自分のフォローしているユーザーの投稿と、全てのローカルユーザーの「ホーム」指定されていない投稿が流れます。STLと略されます。

## Global
全てのローカルユーザーの「ホーム」指定されていない投稿と、サーバーに届いた全てのリモートユーザーの「ホーム」指定されていない投稿が流れます。GTLと略されます。

## Comparar
| ソース          |             |        | Linea de tiempo |        |        |
| ------------ | ----------- | ------ | --------------- | ------ | ------ |
| Usuarios     | Visibilidad | Inicio | Local           | Social | Global |
| ローカル (フォロー)  | 公開          | ✔      | ✔               | ✔      | ✔      |
|              | Inicio      | ✔      |                 | ✔      |        |
|              | Seguidores  | ✔      | ✔               | ✔      | ✔      |
| リモート (フォロー)  | 公開          | ✔      |                 | ✔      | ✔      |
|              | Inicio      | ✔      |                 | ✔      |        |
|              | Seguidores  | ✔      |                 | ✔      | ✔      |
| ローカル (未フォロー) | 公開          |        | ✔               | ✔      | ✔      |
|              | Inicio      |        |                 |        |        |
|              | Seguidores  |        |                 |        |        |
| リモート (未フォロー) | 公開          |        |                 |        | ✔      |
|              | Inicio      |        |                 |        |        |
|              | Seguidores  |        |                 |        |        |