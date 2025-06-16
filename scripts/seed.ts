// scripts/seed.ts

// @ts-nocheck
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { clerkClient } from '@clerk/clerk-sdk-node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKET = 'sunshine-pics';
const FOLDER = 'profile-pictures';

// --- Avatar (user) images from Pravatar ---
const avatarUrls = [
  'https://i.pravatar.cc/300?img=12',
  'https://i.pravatar.cc/300?img=24',
  'https://i.pravatar.cc/300?img=33',
  'https://i.pravatar.cc/300?img=45',
  'https://i.pravatar.cc/300?img=56',
  'https://i.pravatar.cc/300?img=66',
  'https://i.pravatar.cc/300?img=72',
  'https://i.pravatar.cc/300?img=88',
  'https://i.pravatar.cc/300?img=95',
  'https://i.pravatar.cc/300?img=99',
];

// --- Dog images from your Supabase Storage bucket ---
const dogUrls = [
  'dog-1.jpg', 'dog-2.jpg', 'dog-3.jpg', 'dog-4.jpg', 'dog-5.jpg', 'dog-6.jpg', 'dog-7.jpg',
  'dog-8.jpg', 'dog-9.jpg', 'dog-10.jpg', 'dog-11.jpg', 'dog-12.jpg', 'dog-13.jpg', 'dog-14.jpg'
];

const volunteerCount = 9;
const individualCount = 3;

// --- Dog names, breeds, bios ---
const dogNames = [
  "Max", "Bella", "Charlie", "Daisy", "Buddy", "Lucy", "Rocky", "Sadie", "Bailey", "Maggie", "Duke", "Luna", "Cooper", "Zoe"
];
const dogBreeds = [
  "Labrador Retriever", "Golden Retriever", "German Shepherd", "Poodle", "Bulldog", "Beagle", "Boxer",
  "Dachshund", "Corgi", "French Bulldog", "Australian Shepherd", "Bernese Mountain Dog", "Shih Tzu", "Border Collie"
];
const dogBios = [
  "Max loves belly rubs and is happiest running around the park with new friends.",
  "Bella enjoys long walks and curling up on the couch after a fun day.",
  "Charlie is gentle, loves children, and never misses a chance for a treat.",
  "Daisy brings smiles wherever she goes and adores playing fetch.",
  "Buddy is calm, patient, and always up for a snuggle.",
  "Lucy lights up every room and has a soft spot for squeaky toys.",
  "Rocky is adventurous and loves making people laugh with his goofy tricks.",
  "Sadie is sweet and affectionate, especially with seniors.",
  "Bailey loves meeting new people and sharing gentle paw-shakes.",
  "Maggie is easygoing, mellow, and enjoys quiet afternoons in the sun.",
  "Duke is full of energy and loves playing in the backyard.",
  "Luna is gentle, affectionate, and the perfect lap dog.",
  "Cooper is always happy, especially when there are treats involved.",
  "Zoe enjoys exploring new places and making new friends."
];

// --- Volunteer bios ---
const volunteerBios = [
  "Loves volunteering with therapy dogs and bringing smiles to people’s faces.",
  "Passionate about animal welfare and connecting with the community.",
  "Enjoys spending weekends at local parks and helping others.",
  "Believes in the healing power of animals and friendly conversation.",
  "Active volunteer who finds joy in every new therapy visit.",
  "Brings a positive attitude and lots of treats to every session.",
  "Enjoys organizing events and introducing her dog to new friends.",
  "Always ready to lend a hand and spread kindness.",
  "Finds happiness in supporting others and building connections."
];

// --- Individual (therapy seeker) bios ---
const individualBios = [
  "Looking forward to relaxing therapy dog visits after work.",
  "Dog lover who appreciates calm company and a gentle paw.",
  "Believes that a dog’s smile is the best therapy there is."
];

// --- Name data ---
const firstNames = ["Grace", "Henry", "Olivia", "Sam", "Emma", "Jack", "Sophia", "Liam", "Chloe", "Ben", "Ava", "Luke"];
const lastNames = ["Taylor", "Brown", "Smith", "Lee", "Miller", "Davis", "Wilson", "Clark", "Walker", "Young", "Wright", "Harris"];

// --- Get Supabase public URL for a file in your bucket ---
function getDogImageUrl(fileName: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`${FOLDER}/${fileName}`);
  return data.publicUrl;
}

async function createUserWithImage(role: 'volunteer' | 'individual', avatarUrl: string, index: number) {
  const first = firstNames[index % firstNames.length];
  const last = lastNames[(index + 3) % lastNames.length];
  const email = `${first.toLowerCase()}+clerk_test@example.com`;
  const password = email;
  let bio = role === 'volunteer'
    ? volunteerBios[index % volunteerBios.length]
    : individualBios[index % individualBios.length];

  const user = await clerkClient.users.createUser({
    emailAddress: [email],
    password,
    firstName: first,
    lastName: last,
    publicMetadata: { role: role },
    unsafeMetadata: { bio },
  });

  // For this setup, just use the Pravatar URL directly as the user's profile image.
  return {
    ...user,
    bio,
    imageUrl: avatarUrl,
  };
}

async function insertDog(volunteer: any, dogIndex: number) {
  const dog = {
    dog_name: dogNames[dogIndex % dogNames.length],
    dog_breed: dogBreeds[dogIndex % dogBreeds.length],
    dog_age: 2 + (dogIndex % 7), // Age 2-8 for variety
    dog_bio: dogBios[dogIndex % dogBios.length],
    dog_picture_url: getDogImageUrl(dogUrls[dogIndex % dogUrls.length]),
    volunteer_id: volunteer.id,
  };

  await supabase.from('dogs').insert(dog);
}

async function seed() {
  const volunteers: any[] = [];
  const individuals: any[] = [];

  console.log('Creating volunteer users...');
  for (let i = 0; i < volunteerCount; i++) {
    const user = await createUserWithImage('volunteer', avatarUrls[i % avatarUrls.length], i);
    volunteers.push(user);
  }

  console.log('Creating individual users...');
  for (let i = 0; i < individualCount; i++) {
    const user = await createUserWithImage('individual', avatarUrls[(i + 9) % avatarUrls.length], i + 9);
    individuals.push(user);
  }

  console.log('Inserting volunteer Supabase records and dog profiles...');
  for (let i = 0; i < volunteers.length; i++) {
    const v = volunteers[i];

    await supabase.from('users').insert({
      id: v.id,
      first_name: v.firstName,
      last_name: v.lastName,
      email: v.emailAddresses[0].emailAddress,
      role: 'volunteer',
      bio: v.bio,
      created_at: new Date(),
      updated_at: new Date(),
      profile_image: v.imageUrl,
      phone_number: null,
    });

    await insertDog(v, i);
  }

  console.log('Inserting individual Supabase records...');
  for (let i = 0; i < individuals.length; i++) {
    const u = individuals[i];
    await supabase.from('users').insert({
      id: u.id,
      first_name: u.firstName,
      last_name: u.lastName,
      email: u.emailAddresses[0].emailAddress,
      role: 'individual',
      bio: u.bio,
      created_at: new Date(),
      updated_at: new Date(),
      profile_image: u.imageUrl,
      phone_number: null,
    });
  }

  console.log('✅ Seeding complete.');
}

seed().catch((err) => {
  console.error('❌ Error during seeding:', err);
});
