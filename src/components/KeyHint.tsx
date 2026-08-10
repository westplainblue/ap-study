/**
 * キーボード操作のヒント。CSS(.kbd-hint)で PC かつマウス環境のときだけ表示する。
 * タッチ端末に「キーを押せ」と出しても混乱するだけなので、hover/pointer で絞る。
 */
interface Props {
  /** 選択肢の数(1〜n のキーを案内する) */
  choiceCount?: number;
  answered: boolean;
  /** 「あとで復習」が使える画面か */
  canReview?: boolean;
  /** 確信度メモ(J/N)が使える画面か */
  canConf?: boolean;
}

export default function KeyHint({ choiceCount = 4, answered, canReview, canConf }: Props) {
  return (
    <div className="kbd-hint" aria-hidden>
      <span>
        <kbd>1</kbd>〜<kbd>{choiceCount}</kbd> または <kbd>A</kbd>〜
        <kbd>{String.fromCharCode(64 + choiceCount)}</kbd> で解答
      </span>
      {answered && (
        <span>
          <kbd>Enter</kbd>で次へ
        </span>
      )}
      {answered && canConf && (
        <span>
          <kbd>J</kbd>/<kbd>N</kbd>で自信メモ
        </span>
      )}
      {answered && canReview && (
        <span>
          <kbd>R</kbd>であとで復習
        </span>
      )}
    </div>
  );
}
