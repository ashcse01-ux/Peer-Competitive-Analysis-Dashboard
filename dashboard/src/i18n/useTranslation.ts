import { useDashboardStore } from '../store'
import { t as translate, type Lang } from './translations'

export function useTranslation() {
  const lang = useDashboardStore(s => s.language)
  const t = (key: string) => translate(lang, key)
  const tagLabel = (tagId: string) => translate(lang, `tag.${tagId}`)
  return { lang, t, tagLabel }
}

export type { Lang }
