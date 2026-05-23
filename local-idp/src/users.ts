export interface User {
  id: string;
  name: string;
  email: string;
  groups: string[];
  tenantId: string;
}

export const users: User[] = [
  {
    id: "user-admin-1",
    name: "Admin User",
    email: "admin@example.com",
    groups: ["admin", "user"],
    tenantId: "tenant-a",
  },
  {
    id: "user-normal-1",
    name: "Normal User",
    email: "normal@example.com",
    groups: ["user"],
    tenantId: "tenant-a",
  },
  {
    id: "user-other-1",
    name: "Other Tenant User",
    email: "other@example.com",
    groups: ["user"],
    tenantId: "tenant-b",
  },
];
