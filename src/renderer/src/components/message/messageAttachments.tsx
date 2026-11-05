import { displayFileName } from '../../lib/chatAttachments';
import { FileIcon } from '../fileIcon';
import { ZoomableImage } from '../zoomableImage';

/** Images and files attached to a sent message, shown inside its bubble under the text. */
export function MessageAttachments({
  imageSources,
  filePaths = [],
  inlineFileNames = [],
}: {
  imageSources: string[];
  filePaths?: string[];
  inlineFileNames?: string[];
}): React.JSX.Element {
  return (
    <>
      {imageSources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {imageSources.map((source, index) => (
            <ZoomableImage
              key={`${index}-${source.slice(0, 24)}`}
              src={source}
              alt="Attached image"
              className="size-16 rounded-chip border border-border/60 bg-background object-cover"
            />
          ))}
        </div>
      )}
      {(filePaths.length > 0 || inlineFileNames.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {filePaths.map((path) => (
            <button
              key={path}
              type="button"
              className="flex max-w-56 items-center gap-1.5 rounded-chip border border-border/50 bg-background/70 px-2 py-1 text-caption text-foreground hover:bg-background"
              title={path}
              onClick={() => window.piApi.previewFile(path)}
            >
              <FileIcon path={path} className="size-3.5" />
              <span className="truncate">{displayFileName(path)}</span>
            </button>
          ))}
          {inlineFileNames.map((name, index) => (
            <span
              key={`${index}-${name}`}
              className="flex max-w-56 items-center gap-1.5 rounded-chip border border-border/50 bg-background/70 px-2 py-1 text-caption text-foreground"
              title="Pasted file"
            >
              <FileIcon path={name} className="size-3.5" />
              <span className="truncate">{displayFileName(name)}</span>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
