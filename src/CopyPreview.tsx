import { ActorProfileView } from "./ActorProfile";
import type { FullActor } from "./types";

type CopyPreviewProps = {
  src: FullActor;
  dst: FullActor;
};

export const CopyPreview: React.FC<CopyPreviewProps> = ({ src, dst }) => {
  return (
    <div>
      <ActorProfileView profile={src} />
      <p style={{ margin: 0 }}>↓</p>
      <ActorProfileView profile={dst} />
    </div>
  );
};
