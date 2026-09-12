export const MASTER_DELETED_OWNER_PREFIX = 'Deleted by master';

export const MASTER_DELETED_OWNER_IDS = new Set([
  '8957203c-70ca-4218-89cb-625e21a43bd9',
  'd3c38a36-5ed2-4f85-8618-223eb9461e6a',
  '81d140a2-b682-4a48-8a7d-cdb372aadd84',
  'fdd91c00-5705-4f70-b184-10bc1246d6a1',
  '4f8200ad-591a-4023-a3d9-5d213ef7c400',
  '20c5d86d-eb18-4ea7-81b7-40fcdabda12c',
]);

export function isMasterDeletedOwner(owner) {
  return Boolean(owner)
    && owner.business_type === 'additional_store'
    && (
      MASTER_DELETED_OWNER_IDS.has(String(owner.id ?? ''))
      || (
        owner.status === 'rejected'
        && String(owner.rejection_reason ?? '').startsWith(MASTER_DELETED_OWNER_PREFIX)
      )
    );
}

export function withoutMasterDeletedOwners(owners) {
  return (owners ?? []).filter(owner => !isMasterDeletedOwner(owner));
}
