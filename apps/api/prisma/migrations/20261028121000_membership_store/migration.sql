-- Relacion explicita entre membresia y tienda (ambas tablas globales).
ALTER TABLE "Membership"
  ADD CONSTRAINT "Membership_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Store"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
