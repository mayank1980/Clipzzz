import React, { useEffect, useRef } from 'react';

/**
 * Reusable React component integrating official captions.js renderer
 * Supports all 26 templates, live template switching, and transcript updates
 */
export default function CaptionedVideo({
  videoRef: externalVideoRef,
  src,
  captions = [],
  preset = 'Karaoke',
  customStyle = null,
  className = '',
  onClick,
  onPlay,
  onPause,
  onTimeUpdate,
  onLoadedMetadata,
  style = {},
  aspectRatio = '9:16',
}) {
  const localVideoRef = useRef(null);
  const videoRef = externalVideoRef || localVideoRef;
  const instanceRef = useRef(null);

  // Convert raw segment words to captions.js format: { word, startTime, endTime }
  const formattedCaptions = React.useMemo(() => {
    if (!captions || captions.length === 0) return [];
    
    // If already in [{ word, startTime, endTime }] format
    if (captions[0]?.startTime !== undefined) return captions;

    // If in [{ word, start, end }] or segments format
    const words = [];
    for (const item of captions) {
      if (item.words && Array.isArray(item.words)) {
        for (const w of item.words) {
          words.push({
            word: w.word,
            startTime: Number(w.start ?? w.startTime ?? 0),
            endTime: Number(w.end ?? w.endTime ?? 0),
          });
        }
      } else if (item.word) {
        words.push({
          word: item.word,
          startTime: Number(item.start ?? item.startTime ?? 0),
          endTime: Number(item.end ?? item.endTime ?? 0),
        });
      }
    }
    return words;
  }, [captions]);

  // Initialize captions.js overlay on the video element
  useEffect(() => {
    let cancelled = false;

    const initCaptions = async () => {
      if (!videoRef.current) return;
      try {
        const { default: captionsjs, getPreset } = await import('captions.js');
        if (cancelled || !videoRef.current) return;

        // Clean up previous instance if any
        if (instanceRef.current) {
          instanceRef.current.destroy();
          instanceRef.current = null;
        }

        let presetConfig = getPreset(preset);
        if (!presetConfig) {
          presetConfig = getPreset('Karaoke');
        }

        // Apply custom color/font overrides if provided
        if (customStyle && presetConfig?.captionsSettings?.style) {
          presetConfig = {
            ...presetConfig,
            captionsSettings: {
              ...presetConfig.captionsSettings,
              style: {
                ...presetConfig.captionsSettings.style,
                ...(customStyle.highlightColor && { highlightColor: customStyle.highlightColor }),
                ...(customStyle.textColor && { fontColor: customStyle.textColor }),
                ...(customStyle.fontSize && { fontSize: customStyle.fontSize }),
              },
            },
          };
        }

        instanceRef.current = captionsjs({
          video: videoRef.current,
          preset: presetConfig,
          captions: formattedCaptions,
        });
      } catch (err) {
        console.warn('[CaptionedVideo] captions.js init note:', err);
      }
    };

    initCaptions();

    return () => {
      cancelled = true;
      if (instanceRef.current) {
        try {
          instanceRef.current.destroy();
        } catch (e) {
          // ignore
        }
        instanceRef.current = null;
      }
    };
  }, [src]);

  // Live preset switching without destroying video playback
  useEffect(() => {
    if (!instanceRef.current) return;
    import('captions.js')
      .then(({ getPreset }) => {
        let presetConfig = getPreset(preset);
        if (!presetConfig) presetConfig = getPreset('Karaoke');

        if (customStyle && presetConfig?.captionsSettings?.style) {
          presetConfig = {
            ...presetConfig,
            captionsSettings: {
              ...presetConfig.captionsSettings,
              style: {
                ...presetConfig.captionsSettings.style,
                ...(customStyle.highlightColor && { highlightColor: customStyle.highlightColor }),
                ...(customStyle.textColor && { fontColor: customStyle.textColor }),
                ...(customStyle.fontSize && { fontSize: customStyle.fontSize }),
              },
            },
          };
        }

        instanceRef.current.preset(presetConfig);
      })
      .catch((err) => console.warn('[CaptionedVideo] preset switch note:', err));
  }, [preset, customStyle]);

  // Update captions when transcript changes
  useEffect(() => {
    if (instanceRef.current && formattedCaptions.length > 0) {
      try {
        instanceRef.current.captions(formattedCaptions);
      } catch (e) {
        // ignore
      }
    }
  }, [formattedCaptions]);

  return (
    <video
      ref={videoRef}
      src={src}
      onClick={onClick}
      onPlay={onPlay}
      onPause={onPause}
      onTimeUpdate={onTimeUpdate}
      onLoadedMetadata={onLoadedMetadata}
      className={className}
      style={style}
      playsInline
    />
  );
}

