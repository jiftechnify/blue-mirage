import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Crendentials } from "./types";

import styles from "./LoginForm.module.css";

type LoginFormProps = {
  onClickLogin: (creds: Crendentials) => void;
};

export const LoginForm: React.FC<LoginFormProps> = ({
  onClickLogin,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form>
      <div>
        <input
          type="email"
          placeholder={t("ui.loginIdent") ?? ""}
          onChange={(e) => setEmail(e.target.value)}
        ></input>
      </div>
      <div>
        <input
          type="password"
          placeholder={t("ui.loginPassword") ?? ""}
          onChange={(e) => setPassword(e.target.value)}
        ></input>
      </div>
      <button
        className={styles.btnLogin}
        type="button"
        onClick={() => onClickLogin({ email, password })}
      >
        {t("ui.login")}
      </button>
    </form>
  );
};
