export interface Equipment {
  _id?: string;
  _rev?: string;
  type: 'equipment';
  id: string;
  name: string;
  configuration?: string;
  areaId?: string;
  isAvailable: boolean;
  isActive?: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentWithMeta extends Equipment {
  _id: string;
  _rev: string;
}
