import {
  AppBskyActorDefs,
  AtpAgent,
  AtpSessionData,
  AtpSessionEvent,
} from "@atproto/api";
import { ResponseType, XRPCError } from "@atproto/xrpc";
import {
  ChangeEventHandler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LoginForm } from "./LoginForm";
import type { Crendentials, FullActor } from "./types";

import { MdLogout } from "react-icons/md";

import styles from "./App.module.css";
import { CopyPreview } from "./CopyPreview";
import { GetSrcActorForm } from "./GetSrcActorForm";
import octocat from "./assets/github-mark.svg";

type GraphActor = AppBskyActorDefs.ProfileView;

const LS_BSKY_SESS_KEY = "bsky_sess";
// const LS_UI_LANG_KEY = "ui_lang";

const atpAgent = new AtpAgent({
  service: "https://bsky.social",
  persistSession: (_: AtpSessionEvent, session: AtpSessionData | undefined) => {
    if (session !== undefined) {
      localStorage.setItem(LS_BSKY_SESS_KEY, JSON.stringify(session));
    }
  },
});

const bsky = atpAgent.api.app.bsky;

const isXRPCError = (err: unknown): err is XRPCError => {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    "error" in err &&
    "success" in err
  );
};

const resumeSession = async (): Promise<AtpSessionData | undefined> => {
  const jsonBskySess = localStorage.getItem(LS_BSKY_SESS_KEY);
  if (jsonBskySess === null) {
    return undefined;
  }

  console.log("resuming session...");
  try {
    const sess = JSON.parse(jsonBskySess) as AtpSessionData;
    await atpAgent.resumeSession(sess);
    console.log("resumed session");
    return sess;
  } catch (err) {
    console.error("failed to resume session:", err);
    return undefined;
  }
};

const withResumeSession = async <T extends unknown>(
  fn: () => Promise<T>,
  maxRetry = 3,
  retryCnt = 0
): Promise<T> => {
  try {
    return await fn();
  } catch (err) {
    if (isXRPCError(err) && err.status === ResponseType.AuthRequired) {
      if (retryCnt !== maxRetry) {
        console.log("auth required -> resume session and retry");
        await resumeSession();
        return withResumeSession(fn, maxRetry, retryCnt + 1);
      } else {
        console.error("exceeded max retry count");
        throw err;
      }
    }
    throw err;
  }
};

const now = () => new Date().toISOString();

type GetActorsResult = {
  actors: GraphActor[];
  cursor: string | undefined;
};

async function fetchAllActors(
  step: (cursor: string) => Promise<GetActorsResult>
): Promise<GraphActor[]> {
  let cursor = "";
  const res: GraphActor[] = [];

  while (true) {
    const resp = await step(cursor);
    res.push(...resp.actors);
    if (!resp.cursor || resp.actors.length === 0) {
      return res;
    }
    cursor = resp.cursor;
  }
}

const getFollowingsStep = (
  handle: string
): ((cursor: string) => Promise<GetActorsResult>) => {
  return async (cursor: string) => {
    const resp = await withResumeSession(() =>
      bsky.graph.getFollows({
        actor: handle,
        cursor,
      })
    );
    return { actors: resp.data.follows, cursor: resp.data.cursor };
  };
};

const getMutesStep = async (cursor: string): Promise<GetActorsResult> => {
  const resp = await withResumeSession(() => bsky.graph.getMutes({ cursor }));
  return { actors: resp.data.mutes, cursor: resp.data.cursor };
};

const getProfile = async (handle: string) => {
  const { data: profile } = await withResumeSession(() => {
    return bsky.actor.getProfile({
      actor: handle,
    });
  });
  return profile;
};

const followActor = async (myDid: string, targetDid: string) => {
  await withResumeSession(() =>
    bsky.graph.follow.create(
      { repo: myDid },
      { subject: targetDid, createdAt: now() }
    )
  );
};

type AppState =
  | "initial"
  | "resumingSession"
  | "beforeLogin"
  | "loginInProgress"
  | "loginFailed"
  | "afterLogin";

const notLoggedIn = (s: AppState): boolean => {
  const notLoggedInStates: AppState[] = [
    "beforeLogin",
    "loginInProgress",
    "loginFailed",
  ];
  return notLoggedInStates.includes(s);
};

const loggedIn = (s: AppState): boolean => {
  const loggedInStates: AppState[] = ["afterLogin"];
  return loggedInStates.includes(s);
};

type Progress =
  | {
      state: "pending";
    }
  | {
      state: "fetchingFollows";
    }
  | {
      state: "following";
      curr: number;
      max: number;
    }
  | {
      state: "refetchingMyFollows";
    };
const incrFollowingCnt = (p: Progress): Progress => {
  if (p.state === "following") {
    return { ...p, curr: p.curr + 1 };
  }
  return p;
};

// type Language = "ja" | "en";
// const nextLang = (lang: Language): Language => {
//   switch (lang) {
//     case "ja":
//       return "en";
//     case "en":
//       return "ja";
//   }
// };

export const App = () => {
  const session = useRef<AtpSessionData | undefined>(undefined);
  const isFirstTime = useRef(true);

  const [appState, setAppState] = useState<AppState>("initial");

  const [myActor, setMyActor] = useState<FullActor | undefined>(undefined);
  const [srcActor, setSrcActor] = useState<FullActor | undefined>(undefined);
  const [followings, setFollowings] = useState<GraphActor[]>([]);
  const [mutes, setMutes] = useState<GraphActor[]>([]);

  const [includeSrcActor, setIncludeSrcActor] = useState(true);
  const [excludeMuted, setExcludeMuted] = useState(true);

  const [progress, setProgress] = useState<Progress>({ state: "pending" });

  // const { t, i18n } = useTranslation();

  const fetchMyFollows = async () => {
    if (session.current === undefined) {
      console.error("session has not started");
      return;
    }

    const [myActor, followingsRes, mutesRes] = await Promise.all([
      getProfile(session.current.handle),
      fetchAllActors(getFollowingsStep(session.current.handle)),
      fetchAllActors(getMutesStep),
    ]);

    setMyActor(myActor);
    setFollowings(followingsRes);
    setMutes(mutesRes);
  };

  const onClickLogin = async (creds: Crendentials) => {
    setAppState("loginInProgress");

    try {
      const loginResp = await atpAgent.login({
        identifier: creds.email,
        password: creds.password,
      });
      session.current = loginResp.data;
    } catch (err) {
      console.error("failed to login:", err);
      setAppState("loginFailed");
      return;
    }

    setAppState("afterLogin");
    await fetchMyFollows();
  };

  // tasks just after launch
  // - restore language setting
  // - resume bsky session (if session is stored)
  useEffect(() => {
    if (!isFirstTime.current) {
      return;
    }

    // const restoreLang = () => {
    //   const lastUsedLang = localStorage.getItem(LS_UI_LANG_KEY);
    //   if (lastUsedLang !== null) {
    //     i18n.changeLanguage(lastUsedLang);
    //   } else {
    //     const systemLang = window.navigator.language;
    //     i18n.changeLanguage(systemLang === "ja" ? "ja" : "en");
    //   }
    // };

    const resumeSess = async () => {
      setAppState("resumingSession");

      const sess = await resumeSession();
      if (sess === undefined) {
        setAppState("beforeLogin");
        return;
      }

      session.current = sess;
      setAppState("afterLogin");
      await fetchMyFollows();
    };

    isFirstTime.current = false;
    // restoreLang();
    resumeSess().catch((err) => console.error(err));
  }, []);

  const onClickLogout = () => {
    session.current = undefined;
    localStorage.removeItem(LS_BSKY_SESS_KEY);

    setMyActor(undefined);
    setSrcActor(undefined);
    setFollowings([]);
    setMutes([]);

    setAppState("beforeLogin");
  };

  const followingsDIDSet = useMemo(() => {
    return new Set(followings.map((actor) => actor.did));
  }, [followings]);

  const mutesDIDSet = useMemo(() => {
    return new Set(mutes.map((actor) => actor.did));
  }, [mutes]);

  const getSrcProfile = useCallback(async (srcHandle: string) => {
    if (session.current === undefined) {
      return;
    }
    setSrcActor(await getProfile(srcHandle));
  }, []);

  const copyFollows = useCallback(
    async (srcActor: FullActor) => {
      if (session.current === undefined) {
        return;
      }

      setProgress({ state: "fetchingFollows" });
      let targetFollowList = await fetchAllActors(
        getFollowingsStep(srcActor.handle)
      );
      if (includeSrcActor) {
        targetFollowList.push(srcActor);
      }
      targetFollowList = targetFollowList.filter(
        (actor) =>
          !followingsDIDSet.has(actor.did) && // skip actors that are already followed
          excludeMuted &&
          !mutesDIDSet.has(actor.did) && // skip actors that are muted if "excludeMuted" is on
          actor.did !== session.current?.did // skip myself
      );

      if (targetFollowList.length === 0) {
        console.log("no actors to follow");
        setProgress({ state: "pending" });
        return;
      }

      setProgress({
        state: "following",
        curr: 0,
        max: targetFollowList.length,
      });
      for (const actor of targetFollowList) {
        console.log(`following ${actor.handle}...`);
        try {
          await followActor(session.current.did, actor.did);
        } catch (err) {
          console.error(err);
        }
        setProgress(incrFollowingCnt);
      }

      setProgress({ state: "refetchingMyFollows" });
      const [updatedMyFollows, updatedMyActor] = await Promise.all([
        fetchAllActors(getFollowingsStep(session.current.handle)),
        getProfile(session.current.handle),
      ]);
      setFollowings(updatedMyFollows);
      setMyActor(updatedMyActor);

      setProgress({ state: "pending" });
    },
    [followingsDIDSet, mutesDIDSet, includeSrcActor, excludeMuted]
  );

  // const onClickLang = () => {
  //   const lang = nextLang(i18n.language as Language);
  //   i18n.changeLanguage(lang);
  //   localStorage.setItem(LS_UI_LANG_KEY, lang);
  // };

  return (
    <>
      <div className={styles.container}>
        <h1 className={styles.title}>Blue Mirage</h1>
        <div className={styles.main}>
          {notLoggedIn(appState) && (
            <LoginForm
              onClickLogin={onClickLogin}
              loginInProgress={appState === "loginInProgress"}
            ></LoginForm>
          )}
          {loggedIn(appState) && (
            <GetSrcActorForm onClickGetProfile={getSrcProfile} />
          )}
          {srcActor && myActor && (
            <div className={styles.copyWrap}>
              <CopyPreview src={srcActor} dst={myActor} />
              <div className={styles.checks}>
                <Checkbox
                  id="follow-src-actor"
                  label="コピー元アカウントをフォローする"
                  checked={includeSrcActor}
                  onChange={() => setIncludeSrcActor((p) => !p)}
                />
                <Checkbox
                  id="exclude-muted"
                  label="ミュート済みのアカウントをフォローしない"
                  checked={excludeMuted}
                  onChange={() => setExcludeMuted((p) => !p)}
                />
              </div>
              <button
                className={styles.followAll}
                type="button"
                onClick={() => copyFollows(srcActor)}
                disabled={progress.state !== "pending"}
              >
                {progress.state !== "pending"
                  ? "コピー中…"
                  : "フォローリストをコピー"}
              </button>
              {progress.state !== "pending" && (
                <div>
                  {(() => {
                    switch (progress.state) {
                      case "fetchingFollows":
                        return "コピー元フォローリスト取得中...";
                      case "following":
                        return `フォロー中... ${progress.curr}/${progress.max}`;
                      case "refetchingMyFollows":
                        return "自分のフォローリストを再取得中...";
                    }
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={styles.toolBtns}>
        {/* <button className={styles.btnLang} type="button" onClick={onClickLang}>
          {i18n.language}
        </button> */}
        {loggedIn(appState) && (
          <button
            className={styles.btnLogout}
            type="button"
            onClick={onClickLogout}
          >
            <MdLogout className={styles.btnLogoutIcon} />
          </button>
        )}
      </div>
      <div className={styles.linkToRepo}>
        <a href="https://github.com/jiftechnify/blue-mirage">
          <img src={octocat} width={20} height={20} alt="github repo" />
        </a>
      </div>
    </>
  );
};

type CheckboxProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
};

const Checkbox: React.FC<CheckboxProps> = ({
  id,
  label,
  checked,
  onChange,
}) => {
  return (
    <div>
      <input id={id} type="checkbox" checked={checked} onChange={onChange} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
};
