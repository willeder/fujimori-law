-- CreateEnum
CREATE TYPE "ContactTarget" AS ENUM ('CLIENT', 'CREDITOR');

-- CreateEnum
CREATE TYPE "LineLinkStatus" AS ENUM ('PENDING', 'LINKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYMENT_REMINDER', 'DEPOSIT_CONFIRM', 'DEADLINE_ALERT');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateTable
CREATE TABLE "cases" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "recordNumber" INTEGER,
    "name" TEXT NOT NULL,
    "furigana" TEXT,
    "phone" TEXT,
    "lineUrl" TEXT,
    "email" TEXT,
    "postalCode" TEXT,
    "prefecture" TEXT,
    "address" TEXT,
    "birthDate" DATE,
    "age" INTEGER,
    "gender" TEXT,
    "maritalStatus" TEXT,
    "maidenName" TEXT,
    "children" TEXT,
    "residenceType" TEXT,
    "rent" INTEGER,
    "monthlyIncome" INTEGER,
    "payDay" TEXT,
    "employmentType" TEXT,
    "cautionRank" TEXT,
    "correspondenceRequired" TEXT,
    "correspondenceHours" TEXT,
    "cohabitation" TEXT,
    "confidentialContact" TEXT,
    "emergencyContact" TEXT,
    "emergencyContactRelation" TEXT,
    "previousAddress" TEXT,
    "payrollAccount" TEXT,
    "employerName" TEXT,
    "employerContact" TEXT,
    "employerAddress" TEXT,
    "previousEmployerName" TEXT,
    "previousEmployerContact" TEXT,
    "previousEmployerAddress" TEXT,
    "otherOfficeConsultation" TEXT,
    "paymentDelay" TEXT,
    "bicycleNote" TEXT,
    "pension" TEXT,
    "appointmentStaff" TEXT,
    "followUpStaff" TEXT,
    "interviewStaff" TEXT,
    "judicialScrivener" TEXT,
    "debtAdjustmentType" TEXT,
    "acceptanceRank" TEXT,
    "acceptanceDate" DATE,
    "elapsedDays" INTEGER,
    "cAcceptancePromotionDate" DATE,
    "interviewMemo1" TEXT,
    "interviewMemo2" TEXT,
    "incomeExpenseMemo" TEXT,
    "creditorCount" INTEGER,
    "declaredDebtAmount" INTEGER,
    "totalDebtAmount" INTEGER,
    "preRequestPayment" INTEGER,
    "postRequestPayment" INTEGER,
    "settlementStatus" TEXT,
    "settlementProposalDate" DATE,
    "settlementCount" INTEGER,
    "postSettlementPaymentCount" INTEGER,
    "plannedPaymentCount" INTEGER,
    "plannedAgentCount" INTEGER,
    "allSettlementDocSentDate" DATE,
    "normalFee" INTEGER,
    "officeFee" INTEGER,
    "installmentCount" INTEGER,
    "agentPayment" TEXT,
    "plannedPaymentFeeTotal" INTEGER,
    "uncollectedFee" INTEGER,
    "firstPaymentDate" DATE,
    "firstPaymentWithinTenDays" TEXT,
    "firstPaymentAmount" INTEGER,
    "monthlyPaymentDay" TEXT,
    "basePaymentAmount" INTEGER,
    "nextPaymentDate" DATE,
    "cumulativePaymentAmount" INTEGER,
    "cumulativePlannedPayment" INTEGER,
    "cumulativeFeeAllocation" INTEGER,
    "cumulativePlannedFeeAllocation" INTEGER,
    "cumulativePoolAllocation" INTEGER,
    "cumulativeRepaymentAllocation" INTEGER,
    "totalMinusPoolMinusRepayment" INTEGER,
    "notificationExcluded" TEXT,
    "vAccountBranch" TEXT,
    "vAccountNumber" TEXT,
    "reminderDate" DATE,
    "reminderTime" TEXT,
    "nextResponseDate" DATE,
    "responseTime" TEXT,
    "listCategory" TEXT,
    "listRegisteredDate" DATE,
    "acceptanceDocs" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creditors" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "creditorName" TEXT NOT NULL,
    "negotiationPartner" TEXT,
    "declaredAmount" INTEGER,
    "debtAmount" INTEGER,
    "expectedSettlement" INTEGER,
    "expectedSettlementAmount" INTEGER,
    "expectedPaymentCount" INTEGER,
    "expectedFutureInterest" TEXT,
    "status" TEXT NOT NULL,
    "repaymentExcluded" TEXT,
    "check" TEXT,
    "nextProcessDate" DATE,
    "acceptanceNoticeSentDate" DATE,
    "debtInquiryArrivalDate" DATE,
    "customerCode" TEXT,
    "contractDate" DATE,
    "settlementProposalDate" DATE,
    "settlementProposal" INTEGER,
    "responseStatus" TEXT,
    "settlementDate" DATE,
    "settlementAmount" INTEGER,
    "settlementDebtAmount" INTEGER,
    "settlementContentComment" TEXT,
    "reminder" TEXT,
    "paymentStartMonth" TEXT,
    "paymentDay" INTEGER,
    "paymentCount" INTEGER,
    "firstPaymentAmount" INTEGER,
    "subsequentPaymentAmount" INTEGER,
    "finalPaymentAmount" INTEGER,
    "finalPaymentMonth" TEXT,
    "futureInterest" TEXT,
    "bankName" TEXT,
    "financialInstitutionCode" TEXT,
    "branchName" TEXT,
    "branchCode" TEXT,
    "accountType" TEXT,
    "accountNumber" TEXT,
    "accountHolder" TEXT,
    "designatedCode" TEXT,
    "repaymentTarget" TEXT,

    CONSTRAINT "creditors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "creditorId" INTEGER,
    "creditorInstallmentIndex" INTEGER,
    "plannedDate" DATE,
    "plannedAmount" INTEGER,
    "plannedFeeAllocation" INTEGER,
    "plannedAgentFeeAllocation" INTEGER,
    "plannedPoolAllocation" INTEGER,
    "plannedRepaymentAllocation" INTEGER,
    "actualDate" DATE,
    "actualAmount" INTEGER,
    "actualFeeAllocation" INTEGER,
    "actualAgentFeeAllocation" INTEGER,
    "actualPoolAllocation" INTEGER,
    "actualRepaymentAllocation" INTEGER,
    "handlingFee" INTEGER,
    "repaymentCount" INTEGER,
    "cumulativePool" INTEGER,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_histories" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "contactDate" DATE,
    "contactTime" TEXT,
    "staff" TEXT,
    "tool" TEXT,
    "targetType" "ContactTarget" NOT NULL,
    "creditorName" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_links" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "registrationCode" TEXT NOT NULL,
    "lineUserId" TEXT,
    "status" "LineLinkStatus" NOT NULL DEFAULT 'PENDING',
    "codeExpiresAt" TIMESTAMP(3),
    "linkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_notification_logs" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "recipientLineUserId" TEXT,
    "messageContent" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "cases_externalId_key" ON "cases"("externalId");

-- CreateIndex
CREATE INDEX "cases_cautionRank_idx" ON "cases"("cautionRank");

-- CreateIndex
CREATE INDEX "cases_settlementStatus_idx" ON "cases"("settlementStatus");

-- CreateIndex
CREATE INDEX "cases_name_idx" ON "cases"("name");

-- CreateIndex
CREATE INDEX "creditors_caseId_idx" ON "creditors"("caseId");

-- CreateIndex
CREATE INDEX "creditors_status_idx" ON "creditors"("status");

-- CreateIndex
CREATE INDEX "payments_caseId_idx" ON "payments"("caseId");

-- CreateIndex
CREATE INDEX "payments_creditorId_idx" ON "payments"("creditorId");

-- CreateIndex
CREATE INDEX "payments_plannedDate_idx" ON "payments"("plannedDate");

-- CreateIndex
CREATE INDEX "contact_histories_caseId_idx" ON "contact_histories"("caseId");

-- CreateIndex
CREATE INDEX "contact_histories_targetType_idx" ON "contact_histories"("targetType");

-- CreateIndex
CREATE UNIQUE INDEX "line_links_caseId_key" ON "line_links"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "line_links_registrationCode_key" ON "line_links"("registrationCode");

-- CreateIndex
CREATE UNIQUE INDEX "line_links_lineUserId_key" ON "line_links"("lineUserId");

-- CreateIndex
CREATE INDEX "line_links_lineUserId_idx" ON "line_links"("lineUserId");

-- CreateIndex
CREATE INDEX "line_notification_logs_status_idx" ON "line_notification_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "line_notification_logs_caseId_scheduledDate_type_key" ON "line_notification_logs"("caseId", "scheduledDate", "type");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerAccountId_key" ON "accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- AddForeignKey
ALTER TABLE "creditors" ADD CONSTRAINT "creditors_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_creditorId_fkey" FOREIGN KEY ("creditorId") REFERENCES "creditors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_histories" ADD CONSTRAINT "contact_histories_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_links" ADD CONSTRAINT "line_links_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "line_notification_logs" ADD CONSTRAINT "line_notification_logs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
