import type { FullActor } from "./types";

import styles from "./ActorProfile.module.css";

type ActorProfileViewProps = {
  profile: FullActor;
};

export const ActorProfileView: React.FC<ActorProfileViewProps> = ({
  profile,
}) => {
  const { avatar, displayName, handle, followsCount } = profile;

  return (
    <div className={styles.container}>
      <div className={styles.avatarArea}>
        <div className={styles.avatarWrap}>
          {avatar ? (
            <img className={styles.avatar} src={avatar} alt="avatar"></img>
          ) : (
            <div className={styles.avatar} />
          )}
        </div>
      </div>
      <div className={styles.NameArea}>
        <span className={styles.displayName}>{displayName ?? handle}</span>
        {displayName && <span className={styles.handle}>{handle}</span>}
        <span className={styles.followsCount}>
          {followsCount ?? 0} フォロー
        </span>
      </div>
    </div>
  );
};
