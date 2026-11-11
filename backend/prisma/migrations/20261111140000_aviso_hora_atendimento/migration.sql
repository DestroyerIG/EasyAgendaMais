-- Aviso "hora de atender": marca quando o aviso do horario ja foi enviado (uma vez por agendamento).
ALTER TABLE "appointments" ADD COLUMN "hora_avisada_em" TIMESTAMPTZ(6);
