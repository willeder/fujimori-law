/**
 * DB（フラットな列）→ client-mock が期待する JSON 形へ復元するシリアライザ。
 * 既存 UI を一切変えずに済むよう、cases.json / creditors.json /
 * payments.json / contactHistories.json と同一の形・型を再現する。
 */
import type {
  Case as CaseRow,
  Creditor as CreditorRow,
  Payment as PaymentRow,
  ContactHistory as ContactRow,
} from '@prisma/client'

/** Date → 'YYYY-MM-DD'（null はそのまま）。元 JSON は日付のみ文字列だった */
const ds = (v: Date | null): string | null =>
  v ? v.toISOString().slice(0, 10) : null

export function toCaseJson(c: CaseRow) {
  return {
    id: c.id,
    clientBasicInfo: {
      name: c.name,
      furigana: c.furigana,
      phone: c.phone,
      lineUrl: c.lineUrl,
      email: c.email,
      postalCode: c.postalCode,
      prefecture: c.prefecture,
      address: c.address,
      birthDate: ds(c.birthDate),
      age: c.age,
      gender: c.gender,
      maritalStatus: c.maritalStatus,
      maidenName: c.maidenName,
      children: c.children,
      residenceType: c.residenceType,
      rent: c.rent,
      monthlyIncome: c.monthlyIncome,
      payDay: c.payDay,
      employmentType: c.employmentType,
      cautionRank: c.cautionRank,
      recordNumber: c.recordNumber,
      correspondenceRequired: c.correspondenceRequired,
      correspondenceHours: c.correspondenceHours,
      cohabitation: c.cohabitation,
      confidentialContact: c.confidentialContact,
      emergencyContact: c.emergencyContact,
      emergencyContactRelation: c.emergencyContactRelation,
      previousAddress: c.previousAddress,
      payrollAccount: c.payrollAccount,
      employerName: c.employerName,
      employerContact: c.employerContact,
      employerAddress: c.employerAddress,
      previousEmployerName: c.previousEmployerName,
      previousEmployerContact: c.previousEmployerContact,
      previousEmployerAddress: c.previousEmployerAddress,
      otherOfficeConsultation: c.otherOfficeConsultation,
      paymentDelay: c.paymentDelay,
      bicycleNote: c.bicycleNote,
      pension: c.pension,
    },
    appointmentInfo: {
      appointmentStaff: c.appointmentStaff,
      followUpStaff: c.followUpStaff,
      interviewStaff: c.interviewStaff,
      judicialScrivener: c.judicialScrivener,
      debtAdjustmentType: c.debtAdjustmentType,
      acceptanceRank: c.acceptanceRank,
      acceptanceDate: ds(c.acceptanceDate),
      elapsedDays: c.elapsedDays,
      cAcceptancePromotionDate: ds(c.cAcceptancePromotionDate),
      interviewMemo1: c.interviewMemo1,
      interviewMemo2: c.interviewMemo2,
      incomeExpenseMemo: c.incomeExpenseMemo,
    },
    debtInfo: {
      creditorCount: c.creditorCount,
      declaredDebtAmount: c.declaredDebtAmount,
      totalDebtAmount: c.totalDebtAmount,
      preRequestPayment: c.preRequestPayment,
      postRequestPayment: c.postRequestPayment,
    },
    settlementInfo: {
      status: c.settlementStatus,
      proposalDate: ds(c.settlementProposalDate),
      settlementCount: c.settlementCount,
      postSettlementPaymentCount: c.postSettlementPaymentCount,
      plannedPaymentCount: c.plannedPaymentCount,
      plannedAgentCount: c.plannedAgentCount,
      allSettlementDocSentDate: ds(c.allSettlementDocSentDate),
    },
    feeInfo: {
      normalFee: c.normalFee,
      officeFee: c.officeFee,
      installmentCount: c.installmentCount,
      agentPayment: c.agentPayment,
      plannedPaymentFeeTotal: c.plannedPaymentFeeTotal,
      uncollectedFee: c.uncollectedFee,
    },
    paymentInfo: {
      firstPaymentDate: ds(c.firstPaymentDate),
      firstPaymentWithinTenDays: c.firstPaymentWithinTenDays,
      firstPaymentAmount: c.firstPaymentAmount,
      monthlyPaymentDay: c.monthlyPaymentDay,
      basePaymentAmount: c.basePaymentAmount,
      nextPaymentDate: ds(c.nextPaymentDate),
      cumulativePaymentAmount: c.cumulativePaymentAmount,
      cumulativePlannedPayment: c.cumulativePlannedPayment,
      cumulativeFeeAllocation: c.cumulativeFeeAllocation,
      cumulativePlannedFeeAllocation: c.cumulativePlannedFeeAllocation,
      cumulativePoolAllocation: c.cumulativePoolAllocation,
      cumulativeRepaymentAllocation: c.cumulativeRepaymentAllocation,
      totalMinusPoolMinusRepayment: c.totalMinusPoolMinusRepayment,
      notificationExcluded: c.notificationExcluded,
      vAccountBranch: c.vAccountBranch,
      vAccountNumber: c.vAccountNumber,
    },
    reminderInfo: {
      reminderDate: ds(c.reminderDate),
      reminderTime: c.reminderTime,
      nextResponseDate: ds(c.nextResponseDate),
      responseTime: c.responseTime,
    },
    metadata: {
      createdAt: ds(c.createdAt),
      updatedAt: ds(c.updatedAt),
      createdBy: c.createdBy,
      updatedBy: c.updatedBy,
      externalId: c.externalId,
      listCategory: c.listCategory,
      listRegisteredDate: ds(c.listRegisteredDate),
      acceptanceDocs: c.acceptanceDocs,
    },
  }
}

export function toCreditorJson(c: CreditorRow) {
  return {
    ...c,
    nextProcessDate: ds(c.nextProcessDate),
    acceptanceNoticeSentDate: ds(c.acceptanceNoticeSentDate),
    debtInquiryArrivalDate: ds(c.debtInquiryArrivalDate),
    contractDate: ds(c.contractDate),
    settlementProposalDate: ds(c.settlementProposalDate),
    settlementDate: ds(c.settlementDate),
  }
}

export function toPaymentJson(p: PaymentRow) {
  return {
    ...p,
    plannedDate: ds(p.plannedDate),
    actualDate: ds(p.actualDate),
  }
}

export function toContactJson(h: ContactRow) {
  const { createdAt: _omit, ...rest } = h
  return {
    ...rest,
    contactDate: ds(h.contactDate),
    targetType: h.targetType === 'CREDITOR' ? '債権者' : '依頼者',
  }
}
