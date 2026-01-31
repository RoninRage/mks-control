export interface Equipment {
  _id?: string;
  _rev?: string;
  id: string;
  name: string;
  area?: string;
  isAvailable: boolean;
}

export interface EquipmentWithMeta extends Equipment {
  _id: string;
  _rev: string;
}
