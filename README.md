# Audio Discrimination Battery (統合版)

4 つの弁別タスクを 1 ページで連続実施するための統合版です。受験者に内容を知らせないよう、画面上はダミーコード（リスニングタスク1〜4）で表示し、CSV には実タスク名を保持します。受験者 ID に基づいてタスク順が決定的にシャッフルされます。

## ダミーコード対応（研究者向け）
- リスニングタスク1: ピッチの弁別
- リスニングタスク2: フォルマントの弁別
- リスニングタスク3: 持続時間の弁別
- リスニングタスク4: 立ち上がり時間の弁別
- ※ 上記の対応や刺激設定の詳細は参加者向け画面には表示されません。

## 必要ファイルと配置
- 本フォルダ `audio_discrimination` を、各タスクフォルダと同じ階層に置くことを前提としています。  
  例:  
  ```
  .../Discrimination/
    ├ audio_discrimination/
    ├ duration_discrimination/
    ├ formant_discrimination/
    ├ pitch_discrimination/
    └ risetime_discrimination/
  ```
- 各タスクの `Stimuli/1.flac` 〜 `Stimuli/101.flac` をそのまま利用します。ファイル名やパスを変更しないでください。

## 使い方
1. ブラウザで `audio_discrimination/index.html` を開きます（ローカルでも GitHub Pages でも可）。
2. 受験者 ID を入力し、「順番を決めて進む」を押すと、今回の実施順が決まります。  
   - 同じ ID なら同じ順番、異なる ID なら新しい順番になります。
3. 画面の案内に従い、各タスクで「練習」→「本番」を実施します。練習は刺激 1 と 100 を使った全 5 回でフィードバックあり。完了後、スペースキーまたはボタンで本番を開始します（本番ではフィードバックと進捗表示なし）。
4. 4 タスクすべて終了後、「結果をダウンロード」から全試行の CSV を取得できます。

## データ出力
- ファイル名: `<受験者ID>_audio_discrimination.csv`
- 主な列:  
  - `subject_id` / `task_id` / `task_label` / `task_order`  
  - `trial`, `stimulus_step`, `odd_position`, `correct_answer`, `response`, `correct`, `rt_ms`  
  - `num_reversals_after`, `step_before`, `step_after`, `step_size_used`, `mean_reversal_so_far`, `threshold_estimate`
- タスク完了時に各タスクの閾値（リバーサル平均）を画面表示し、サマリーにも記載します。
  - CSV の `task_label` は実タスク名（例: ピッチの弁別）を保持し、UI ではダミーコードのみを表示します。

## パラメータ概要
- 本番試行: 最大 75 試行 or リバーサル 7 回で終了
- 練習試行: 5 試行、刺激 1 と 100 を使用（終了後にスペースキー/ボタンで本番へ移行）
- フィードバック: 練習のみ表示（本番は非表示）
- 進捗表示: 練習のみ表示（本番は非表示）
- インタースティミュラス間隔: 500 ms / シーケンス後待機: 500 ms / 反応後: 1000 ms

## 注意点
- フォルダ名や Stimuli のパスを変えると再生に失敗します。構造を保ったままデプロイしてください。
- ブラウザを閉じるとページ内メモリにある結果は消えます。終了後は必ず CSV を保存してください。
