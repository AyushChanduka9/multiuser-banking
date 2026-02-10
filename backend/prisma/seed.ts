import { PrismaClient, Role, Tier } from '@prisma/client';
import bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding database...');

    // Create admin account
    const adminPinHash = await bcrypt.hash('1234', 12);

    const admin = await prisma.account.upsert({
        where: { accountNumber: '000000000001' },
        update: {},
        create: {
            accountNumber: '000000000001',
            fullName: 'System Admin',
            aadhaar: '111111111111',
            pan: 'ADMIN0000A',
            mobile: '9999999999',
            email: 'admin@nexusbank.com',
            pinHash: adminPinHash,
            balance: new Decimal(1000000),
            tier: 'VIP',
            role: 'ADMIN',
            isFirstLogin: false,
            riskScore: 0,
        },
    });

    console.log('✅ Admin account created:');
    console.log(`   Account Number: ${admin.accountNumber}`);
    console.log(`   Name: ${admin.fullName}`);
    console.log(`   PIN: 1234`);
    console.log(`   Email: ${admin.email}`);

    // Create a few demo customer accounts for testing
    const customers = [
        {
            accountNumber: '202602051001',
            fullName: 'Rahul Sharma',
            aadhaar: '222222222222',
            pan: 'ABCDE1234F',
            mobile: '9876543210',
            email: 'customer1@demo.com',
            tier: 'BASIC' as Tier,
            pinHash: await bcrypt.hash('1234', 12),
        },
        {
            accountNumber: '202602051002',
            fullName: 'Priya Patel',
            aadhaar: '333333333333',
            pan: 'FGHIJ5678K',
            mobile: '9876543211',
            email: 'customer2@demo.com',
            tier: 'PREMIUM' as Tier,
            pinHash: await bcrypt.hash('1234', 12),
        },
        {
            accountNumber: '202602051003',
            fullName: 'Amit Verma',
            aadhaar: '444444444444',
            pan: 'LMNOP9012Q',
            mobile: '9876543212',
            email: 'vip@demo.com',
            tier: 'VIP' as Tier,
            pinHash: await bcrypt.hash('1234', 12),
        },
    ];

    for (const customerData of customers) {
        const customer = await prisma.account.upsert({
            where: { accountNumber: customerData.accountNumber },
            update: {},
            create: {
                ...customerData,
                balance: new Decimal(10000),
                role: 'CUSTOMER',
                isFirstLogin: false, // For demo, skip first-time PIN set
                riskScore: Math.floor(Math.random() * 5),
            },
        });

        console.log(`✅ Customer account: ${customer.accountNumber} (${customer.tier})`);
    }

    console.log('\n🎉 Database seeded successfully!');
    console.log('\n📝 Demo Credentials:');
    console.log('   Admin:    000000000001 / 1234');
    console.log('   Customer: 202602051001 / 1234 (BASIC)');
    console.log('   Customer: 202602051002 / 1234 (PREMIUM)');
    console.log('   Customer: 202602051003 / 1234 (VIP)');
}

seed()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
