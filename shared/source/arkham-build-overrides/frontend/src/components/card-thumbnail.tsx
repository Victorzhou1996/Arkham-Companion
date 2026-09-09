import type { Card } from "@arkham-build/shared";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { isArkhamHorrorMode } from "@/utils/arkham-horror-mode";
import {
  advanceImageFallback,
  cardImageFallbackUrls,
  getCardColor,
  thumbnailUrl,
} from "@/utils/card-utils";
import { cx } from "@/utils/cx";
import { useAgathaEasterEggTransform } from "@/utils/easter-egg-agatha";
import css from "./card-thumbnail.module.css";

type Props = {
  card: Card;
  className?: string;
  suffix?: string;
};

// memoize this component with a custom equality check.
// not doing results in a lot of aborted requests in firefox, which in turn seem to lead to cache misses.
export const CardThumbnail = memo(
  (props: Props) => {
    const { card, className, suffix } = props;
    const { t } = useTranslation();

    const colorCls = getCardColor(card);

    const imageCode = useAgathaEasterEggTransform(
      `${card.code}${suffix ?? ""}`,
    );

    const url = isArkhamHorrorMode()
      ? undefined
      : suffix === "b"
        ? card.back_thumbnail_url
        : card.thumbnail_url;
    const remoteUrl =
      suffix === "b" ? card.back_thumbnail_url : card.thumbnail_url;
    const source = url ? url : thumbnailUrl(imageCode);

    return (
      <div
        className={cx(
          css["thumbnail"],
          css[card.type_code],
          card.subtype_code && css[card.subtype_code],
          colorCls,
          className,
        )}
        key={card.code}
        data-testid="card-thumbnail"
        data-component="card-thumbnail"
      >
        <img
          key={source}
          alt={t("card_view.thumbnail", { code: card.code })}
          onError={(event) =>
            advanceImageFallback(
              event.currentTarget,
              cardImageFallbackUrls(imageCode, "thumbnails", remoteUrl),
            )
          }
          src={source}
        />
      </div>
    );
  },
  (prev, next) => prev.card.code === next.card.code,
);
