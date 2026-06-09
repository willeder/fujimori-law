/**
 * モックデータ - 依頼者 接触履歴
 */

import type { ContactHistory } from '../types/case'

export const mockContactHistories: ContactHistory[] = [
  {
    id: 1,
    caseId: 1,
    contactDate: '2025-04-10',
    contactTime: '10:15',
    staff: '山田',
    tool: '電話',
    targetType: '依頼者',
    comment: '次回入金予定の確認。支払日変更の相談あり。',
  },
  {
    id: 2,
    caseId: 1,
    contactDate: '2025-06-19',
    contactTime: '19:05',
    staff: '佐藤',
    tool: 'LINE',
    targetType: '依頼者',
    comment: '入金反映済みの連絡。領収確認。',
  },
  {
    id: 3,
    caseId: 2,
    contactDate: '2025-04-15',
    contactTime: '12:40',
    staff: '鈴木',
    tool: 'メール',
    targetType: '依頼者',
    comment: '必要書類の提出依頼。未提出項目のリマインド。',
  },
  {
    id: 4,
    caseId: 3,
    contactDate: '2025-05-03',
    contactTime: '09:20',
    staff: '高橋',
    tool: '電話',
    targetType: '依頼者',
    comment: '和解条件の説明。支払開始月の確認。',
  },
]

