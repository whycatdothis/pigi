import { useState } from 'react';
import { displayFileName } from '../../lib/chatAttachments';
import { FileIcon } from '../fileIcon';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '../ui/dialog';

/** Images and files attached to a sent message, shown inside its bubble under the text. */
export function MessageAttachments({
  imageSources,
  filePaths,
}: {
  imageSources: string[];
  filePaths: string[];
}): React.JSX.Element {
  const [viewedImage, setViewedImage] = useState<string | null>(null);

  return (
    <>
      {imageSources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {imageSources.map((source, index) => (
            <button
              key={`${index}-${source.slice(0, 24)}`}
              type="button"
              className="size-16 shrink-0 cursor-zoom-in"
              onClick={() => setViewedImage(source)}
              aria-label="View image"
            >
              <img
                src={source}
                alt="Attached image"
                className="size-16 rounded-xl border border-border/60 bg-background object-cover"
              />
            </button>
          ))}
        </div>
      )}
      {filePaths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filePaths.map((path) => (
            <button
              key={path}
              type="button"
              className="flex max-w-56 items-center gap-1.5 rounded-lg border border-border/50 bg-background/70 px-2 py-1 text-xs text-foreground hover:bg-background"
              title={path}
              onClick={() => window.piApi.previewFile(path)}
            >
              <FileIcon path={path} className="size-3.5" />
              <span className="truncate">{displayFileName(path)}</span>
            </button>
          ))}
        </div>
      )}
      <Dialog open={viewedImage !== null} onOpenChange={(open) => !open && setViewedImage(null)}>
        <DialogContent
          showCloseButton={false}
          className="w-auto max-w-[90vw] bg-transparent p-0 shadow-none ring-0 backdrop-blur-none"
        >
          <DialogTitle className="sr-only">Attached image</DialogTitle>
          {viewedImage && (
            <DialogClose asChild>
              <img
                src={viewedImage}
                alt="Attached image"
                className="max-h-[85vh] max-w-[90vw] cursor-zoom-out rounded-lg object-contain"
              />
            </DialogClose>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
