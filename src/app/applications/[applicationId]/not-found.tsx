import Link from "next/link";

import s from "@/components/server-guy/applications.module.css";

export default function ApplicationNotFound() {
  return <main className={s.page}><section className={s.content}>
    <h1>Application not found</h1>
    <p>This application is no longer available, or the link is incorrect.</p>
    <Link className={s.primary} href="/applications">All applications</Link>
  </section></main>;
}
