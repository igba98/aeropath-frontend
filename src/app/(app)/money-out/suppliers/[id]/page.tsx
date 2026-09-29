"use client";

import { useParams } from "next/navigation";

import { SupplierDetail } from "@/components/money-out/supplier-detail";

export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  return <SupplierDetail key={id} supplierId={id} />;
}
