import { prisma } from '@/util/db'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

const createNewUser = async () => {
  const user = await currentUser()
  // it is for sure that user is not null as it is authenticated
  console.log(user)
  console.log('Database URL:', process.env.DATABASE_URL)
  const match = await prisma.user.findUnique({
    where: {
      clerkId: user?.id as string,
    },
  })
  if (!match) {
    await prisma.user.create({
      data: {
        clerkId: user?.id as string,
        email: user?.emailAddresses[0]?.emailAddress,
      },
    })
  }
  redirect('/journal')
}

const NewUser = async () => {
  await createNewUser()
  return <div>... Redirecting</div>
}
export default NewUser
