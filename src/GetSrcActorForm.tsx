import { useState } from "react";
import styles from "./GetTargetActorForm.module.css";

type GetSrcActorFormProps = {
  onClickGetProfile: (handle: string) => void;
};

export const GetSrcActorForm: React.FC<GetSrcActorFormProps> = ({
  onClickGetProfile,
}) => {
  const [handleInput, setHandleInput] = useState("");

  const handleClickGetProfile = () => {
    const atTrimmed = handleInput.startsWith("@")
      ? handleInput.slice(1)
      : handleInput;
    onClickGetProfile(atTrimmed);
  };

  return (
    <div className={styles.container}>
      <p className={styles.description}>フォローリストコピー元のハンドルを入力</p>
      <div>
        <input
          type="text"
          placeholder="xxx.bsky.social"
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
        />
      </div>
      <button
        className={styles.button}
        type="button"
        onClick={handleClickGetProfile}
        disabled={handleInput === ""}
      >
        プロフィール取得
      </button>
    </div>
  );
};
