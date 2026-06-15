import PasswordPortal from "@/components/PasswordPortal";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        background: "linear-gradient(160deg, #f0fbfd 0%, #e8f4f6 50%, #f5f5f5 100%)",
      }}
    >
      <PasswordPortal />
    </main>
  );
}
