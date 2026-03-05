import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Rol } from "@prisma/client";
import * as bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter } as any);

const SALT_ROUNDS = 10;

const USUARIOS = [
  {
    email: "inquilino@saferent.es",
    nombre_completo: "Carlos López Martínez",
    password: "Inquilino123!",
    rol: Rol.INQUILINO,
    dni_nie: "12345678A",
  },
  {
    email: "propietario@saferent.es",
    nombre_completo: "María García Fernández",
    password: "Propietario123!",
    rol: Rol.PROPIETARIO,
    dni_nie: "87654321B",
    stripe_account_id: "acct_demo_propietario",
    verificado_kyc: true,
  },
  {
    email: "admin@saferent.es",
    nombre_completo: "Admin SafeRent",
    password: "Admin123!",
    rol: Rol.ADMINISTRADOR,
    dni_nie: "00000000X",
    verificado_kyc: true,
  },
];

async function main() {
  console.log("🌱 Iniciando seed de usuarios...\n");

  for (const usuario of USUARIOS) {
    const { password, ...datos } = usuario;

    // Hashear la contraseña con bcrypt
    const contrasena_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const creado = await prisma.usuario.upsert({
      where: { email: datos.email },
      update: { contrasena_hash },
      create: {
        ...datos,
        contrasena_hash,
      },
    });

    console.log(
      `✅ ${creado.rol.padEnd(14)} | ${creado.nombre_completo.padEnd(28)} | ${creado.email}`
    );
    console.log(`   Hash guardado: ${creado.contrasena_hash.substring(0, 40)}...\n`);
  }

  console.log("✨ Seed completado. Usuarios en la base de datos:\n");
  console.log("┌─────────────────┬──────────────────────────────┬────────────────────────────┐");
  console.log("│ Rol             │ Nombre                       │ Email / Contraseña         │");
  console.log("├─────────────────┼──────────────────────────────┼────────────────────────────┤");
  console.log("│ INQUILINO       │ Carlos López Martínez        │ inquilino@saferent.es      │");
  console.log("│                 │                              │ Inquilino123!              │");
  console.log("├─────────────────┼──────────────────────────────┼────────────────────────────┤");
  console.log("│ PROPIETARIO     │ María García Fernández       │ propietario@saferent.es    │");
  console.log("│                 │                              │ Propietario123!            │");
  console.log("├─────────────────┼──────────────────────────────┼────────────────────────────┤");
  console.log("│ ADMINISTRADOR   │ Admin SafeRent               │ admin@saferent.es          │");
  console.log("│                 │                              │ Admin123!                  │");
  console.log("└─────────────────┴──────────────────────────────┴────────────────────────────┘");
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
