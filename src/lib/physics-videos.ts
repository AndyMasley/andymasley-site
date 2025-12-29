// IB Physics video data organized by topic

export interface Video {
  title: string;
  url: string;
}

export interface Subtopic {
  name: string;
  videos: Video[];
}

export interface Topic {
  id: string;
  name: string;
  subtopics: Subtopic[];
}

export const physicsTopics: Topic[] = [
  {
    id: 'a',
    name: 'A: Space, Time and Motion',
    subtopics: [
      {
        name: '1: Kinematics',
        videos: [
          { title: 'Distance and displacement in physics', url: 'https://www.youtube.com/watch?v=HcVzWp782FI&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=1' },
          { title: 'Speed and velocity', url: 'https://www.youtube.com/watch?v=AG0Yy3aRzA0&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=2' },
          { title: 'Acceleration', url: 'https://www.youtube.com/watch?v=wW2Hf-i5-oU&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=3' },
          { title: 'Average vs. instantaneous velocity', url: 'https://www.youtube.com/watch?v=iIbxpbFxIOs&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=4' },
          { title: 'Position-time graphs', url: 'https://www.youtube.com/watch?v=_pDUHbcBlKY&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=5' },
          { title: 'Velocity-time graphs: constant velocity and the area under the curve', url: 'https://www.youtube.com/watch?v=HTM8hGeNTVg&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=6' },
          { title: 'Velocity-time graphs part 2: graphs with changing velocity', url: 'https://www.youtube.com/watch?v=leCHbvmocLo&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=7' },
          { title: 'Translating position and velocity physics graphs', url: 'https://www.youtube.com/watch?v=-UwRQVFHWk0&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=8' },
          { title: 'Acceleration-time graphs', url: 'https://www.youtube.com/watch?v=tf3NM38Y70s&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=9' },
          { title: 'Translating motion graphs: position, velocity, and acceleration', url: 'https://www.youtube.com/watch?v=otwDWOYibuE&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=10' },
          { title: 'Proving kinematics using geometry', url: 'https://www.youtube.com/watch?v=z8GZvnTN7pg&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=12' },
          { title: 'Free fall', url: 'https://www.youtube.com/watch?v=9xqsnFh2Q4I&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=13' },
          { title: '2D projectile motion', url: 'https://www.youtube.com/watch?v=jrvy1ZkvjQQ&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=14' },
          { title: 'Air resistance on projectiles & terminal velocity', url: 'https://www.youtube.com/watch?v=HVdCyCf7eG8&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=15' },
          { title: 'Physics motion maps', url: 'https://www.youtube.com/watch?v=wd7bGnvib-4&list=PLeveVE-rwOyJmg2j2b9z8tzaaytDEXwAy&index=16' },
        ]
      },
      {
        name: '2: Forces and momentum',
        videos: [
          { title: 'Forces & free body diagrams', url: 'https://www.youtube.com/watch?v=B4mtRFTZrjs&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=1' },
          { title: 'Properties of common forces', url: 'https://www.youtube.com/watch?v=mPSyPjfw3TM&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=2' },
          { title: 'Force webs in IB physics', url: 'https://www.youtube.com/watch?v=TApStLs3X4U&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=3' },
          { title: 'Finding the net force', url: 'https://www.youtube.com/watch?v=K4wTddNMVSQ&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=4' },
          { title: 'Mass vs weight', url: 'https://www.youtube.com/watch?v=zq8VL9vtbjQ&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=5' },
          { title: 'Static vs kinetic friction', url: 'https://www.youtube.com/watch?v=eBYbvP8VPdE&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=6' },
          { title: "Newton's first law", url: 'https://www.youtube.com/watch?v=Id-eI9chVeo&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=7' },
          { title: "Newton's second law", url: 'https://www.youtube.com/watch?v=H30f_FNZyLE&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=8' },
          { title: "Newton's third law", url: 'https://www.youtube.com/watch?v=KIMfAOe7ryo&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=9' },
          { title: 'Inclined planes', url: 'https://www.youtube.com/watch?v=Mxja8393hGM&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=10' },
          { title: 'What is momentum?', url: 'https://www.youtube.com/watch?v=5LoMyEZ1XOs&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=11' },
          { title: 'Impulse & Ft graphs', url: 'https://www.youtube.com/watch?v=zis2UlkiQN0&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=12' },
          { title: 'Conservation of momentum', url: 'https://www.youtube.com/watch?v=U9NVCW_GjVI&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=13' },
          { title: 'Momentum - open and closed systems', url: 'https://www.youtube.com/watch?v=VYKuZpmP8i8&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=14' },
          { title: 'Collisions - momentum', url: 'https://www.youtube.com/watch?v=fzxq7hmy6nA&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=15' },
          { title: 'Uniform circular motion', url: 'https://www.youtube.com/watch?v=_ZwjOOKQA08&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=16' },
          { title: '5 examples of solving centripetal force problems', url: 'https://www.youtube.com/watch?v=94krMSdxA48&list=PLeveVE-rwOyKWeDZfaI_o9dKnRDMvOqsW&index=17' },
        ]
      },
      {
        name: '3: Work, energy and power',
        videos: [
          { title: 'Work in physics', url: 'https://www.youtube.com/watch?v=i7tmmv84N7c&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=1' },
          { title: 'Work & energy', url: 'https://www.youtube.com/watch?v=5wi51AFtamY&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=2' },
          { title: 'Kinetic energy', url: 'https://www.youtube.com/watch?v=dRO-lPus188&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=3' },
          { title: 'Gravitational potential energy', url: 'https://www.youtube.com/watch?v=5c61ylNDEjc&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=4' },
          { title: 'Elastic potential energy', url: 'https://www.youtube.com/watch?v=egL7kODCSfc&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=5' },
          { title: 'Thermal energy', url: 'https://www.youtube.com/watch?v=vDDdHsuz5lY&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=6' },
          { title: 'Other types of energy', url: 'https://www.youtube.com/watch?v=XeB8gxVOGZw&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=7' },
          { title: 'Open & closed systems in energy', url: 'https://www.youtube.com/watch?v=4J5Qr0J79g8&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=8' },
          { title: 'LOL diagram energy graph examples', url: 'https://www.youtube.com/watch?v=7Uj5BcAprEo&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=9' },
          { title: 'Force distance graphs', url: 'https://www.youtube.com/watch?v=jm-ewXYs2yQ&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=10' },
          { title: 'Power', url: 'https://www.youtube.com/watch?v=xmMAoNYjE3U&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=12' },
          { title: 'Efficiency in physics', url: 'https://www.youtube.com/watch?v=ZC8UDVFTY6k&list=PLeveVE-rwOyI3HiHjbqDab8Ts47qp-aLI&index=13' },
        ]
      }
    ]
  },
  {
    id: 'b',
    name: 'B: The Particulate Nature of Matter',
    subtopics: [
      {
        name: '1: Thermal energy transfers',
        videos: [
          { title: 'Temperature, thermal energy, and heat', url: 'https://www.youtube.com/watch?v=i0vRvMYP-wg&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=1' },
          { title: 'Phase changes', url: 'https://www.youtube.com/watch?v=K6tFGRtHghE&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=2' },
          { title: 'Q = mcΔT and specific heat', url: 'https://www.youtube.com/watch?v=C_Q-VDeAZAs&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=3' },
          { title: 'Q = mL and latent heat', url: 'https://www.youtube.com/watch?v=Le6brC1JG8U&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=4' },
          { title: 'Using power in heat equations', url: 'https://www.youtube.com/watch?v=zPfkBzj1TQg&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=5' },
          { title: 'How to draw and read temperature vs. heat graphs', url: 'https://www.youtube.com/watch?v=ICl4mgkNaAY&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=6' },
          { title: 'Thermal equilibrium', url: 'https://www.youtube.com/watch?v=p0T5GAtq7AI&list=PLeveVE-rwOyJHUTNJxy2ExAAAxpSVSsbZ&index=7' },
        ]
      },
      {
        name: '2: Greenhouse effect',
        videos: [
          { title: 'Why climate change happens', url: 'https://www.youtube.com/watch?v=eskcI5jhUhM&list=PLeveVE-rwOyKrZ7U1Ni-Iys4cMOQ9owIX' },
        ]
      },
      {
        name: '3: Gas laws',
        videos: [
          { title: 'Pressure', url: 'https://www.youtube.com/watch?v=tN3JzMS6dlo&list=PLeveVE-rwOyLTzktx9IW0CwcTh4cakpIQ&index=1' },
          { title: 'What is an ideal gas?', url: 'https://www.youtube.com/watch?v=NvS7e0BFA0Y&list=PLeveVE-rwOyLTzktx9IW0CwcTh4cakpIQ&index=2' },
          { title: 'The ideal gas law: pV = nRT', url: 'https://www.youtube.com/watch?v=zA9PyKEDXY8&list=PLeveVE-rwOyLTzktx9IW0CwcTh4cakpIQ&index=3' },
          { title: 'The average kinetic energy per molecule equation for an ideal gas', url: 'https://www.youtube.com/watch?v=3D8YNI0LAMs&list=PLeveVE-rwOyLTzktx9IW0CwcTh4cakpIQ&index=4' },
        ]
      },
      {
        name: '5: Current and circuits',
        videos: [
          { title: 'Voltage', url: 'https://www.youtube.com/watch?v=HJpbZKPi4DU&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=2' },
          { title: 'Electron-volts vs joules', url: 'https://www.youtube.com/watch?v=y28qH0HhBLA&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=3' },
          { title: 'Resistance and resistivity', url: 'https://www.youtube.com/watch?v=qBo0wfpXBd8&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=4' },
          { title: 'Circuits', url: 'https://www.youtube.com/watch?v=DpjQTWgeR7M&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=5' },
          { title: 'Series and parallel circuits and equivalent resistance', url: 'https://www.youtube.com/watch?v=dlSPpmAwT9U&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=6' },
          { title: "Ohm's law: V = IR", url: 'https://www.youtube.com/watch?v=YfncCt8D2G8&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=7' },
          { title: 'Ohmic vs. non ohmic resistors', url: 'https://www.youtube.com/watch?v=Ciasa_SH0cI&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=8' },
          { title: 'Ammeters and voltmeters: ideal and non-ideal', url: 'https://www.youtube.com/watch?v=Hm4w2EK6VD8&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=9' },
          { title: 'Power in circuits', url: 'https://www.youtube.com/watch?v=8qj0gLWb9JA&list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X&index=10' },
          { title: 'Internal resistance and EMF', url: 'https://www.youtube.com/playlist?list=PLeveVE-rwOyKO_cVsakHfE6be78XEI-_X' },
        ]
      }
    ]
  },
  {
    id: 'c',
    name: 'C: Wave Behavior',
    subtopics: [
      {
        name: '1: Simple harmonic motion',
        videos: [
          { title: 'Simple harmonic motion', url: 'https://www.youtube.com/watch?v=NxQQjnpL7U0&list=PLeveVE-rwOyLbpB1YWPTj58WGiOv7Fxwd&index=1' },
          { title: 'Waves: phase difference', url: 'https://www.youtube.com/watch?v=v_oujF9RHK8&list=PLeveVE-rwOyLbpB1YWPTj58WGiOv7Fxwd&index=2' },
        ]
      },
      {
        name: '2: Wave model',
        videos: [
          { title: 'Waves: basic definition, transverse vs longitudinal, mechanical vs electromagnetic', url: 'https://www.youtube.com/watch?v=aG2VKGI4cAo&list=PLeveVE-rwOyLFY29UKzTh6GtiMEmBX3d4&index=1' },
          { title: 'Waves: amplitude, period, frequency, wavelength, crests & troughs', url: 'https://www.youtube.com/watch?v=AVM7fKjurp4&list=PLeveVE-rwOyLFY29UKzTh6GtiMEmBX3d4&index=2' },
          { title: 'Waves: V = λf, velocity of a wave, graphs', url: 'https://www.youtube.com/watch?v=e5__RBQ4zJg&list=PLeveVE-rwOyLFY29UKzTh6GtiMEmBX3d4&index=3' },
          { title: 'Electromagnetic waves', url: 'https://www.youtube.com/watch?v=bxHs9I3lbZc&list=PLeveVE-rwOyLFY29UKzTh6GtiMEmBX3d4&index=4' },
        ]
      },
      {
        name: '3: Wave phenomena',
        videos: [
          { title: 'Waves: superpositions', url: 'https://www.youtube.com/watch?v=Bz_ht0pPjFw&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=1' },
          { title: 'Waves: phase difference', url: 'https://www.youtube.com/watch?v=v_oujF9RHK8&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=2' },
          { title: 'Wave reflections', url: 'https://www.youtube.com/watch?v=qiUSy2BPrfE&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=3' },
          { title: 'Light intensity', url: 'https://www.youtube.com/watch?v=fGynXsoSA3U&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=4' },
          { title: 'Reflection', url: 'https://www.youtube.com/watch?v=5N6J7gsk7d8&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=5' },
          { title: 'Wavefronts', url: 'https://www.youtube.com/watch?v=QRpV5pOMq34&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=6' },
          { title: "Refraction and Snell's Law", url: 'https://www.youtube.com/watch?v=NcCSGtnUUpw&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=7' },
          { title: 'The critical angle and total internal reflection', url: 'https://www.youtube.com/watch?v=QFYWPamx9F8&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=8' },
          { title: "Diffraction and Huygens's Principle", url: 'https://www.youtube.com/watch?v=he8jSyRWvxE&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=9' },
          { title: "Proving Young's double slit interference equation", url: 'https://www.youtube.com/watch?v=uf1FuO8ONWs&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=10' },
          { title: "Solving problems with Young's double slit interference equation", url: 'https://www.youtube.com/watch?v=dI64_h-Gdxs&list=PLeveVE-rwOyJCK2FSl61JkXGY5fjN8X7c&index=11' },
        ]
      },
      {
        name: '4: Standing waves and resonance',
        videos: [
          { title: 'Standing waves', url: 'https://www.youtube.com/watch?v=-HW8JcL8wms&list=PLeveVE-rwOyLvhs287TkxtSlgobSIMKpc&index=1' },
          { title: 'Harmonics of a standing wave', url: 'https://www.youtube.com/watch?v=hCDRaY6xUi4&list=PLeveVE-rwOyLvhs287TkxtSlgobSIMKpc&index=2' },
          { title: 'Sound as a standing wave', url: 'https://www.youtube.com/watch?v=xzQO5M1rjfg&list=PLeveVE-rwOyLvhs287TkxtSlgobSIMKpc&index=3' },
        ]
      }
    ]
  },
  {
    id: 'd',
    name: 'D: Fields',
    subtopics: [
      {
        name: '1: Gravitational fields',
        videos: [
          { title: 'Universal gravitation', url: 'https://www.youtube.com/watch?v=CkmJQdUS0W0&list=PLeveVE-rwOyIARy6utlDC4IaF_jqWqAHl&index=1' },
        ]
      },
      {
        name: '2: Electric and magnetic fields',
        videos: [
          { title: 'Electric charge', url: 'https://www.youtube.com/watch?v=8w904a_vHa4&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=1' },
          { title: "Coulomb's law", url: 'https://www.youtube.com/watch?v=rGKMTNcFaJA&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=2' },
          { title: 'Electric fields', url: 'https://www.youtube.com/watch?v=KO0nOxzIn54&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=3' },
          { title: 'Electron-volts vs joules', url: 'https://www.youtube.com/watch?v=y28qH0HhBLA&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=4' },
          { title: '3D vector notation', url: 'https://www.youtube.com/watch?v=YQXuONgrIS4&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=6' },
          { title: 'The corner right hand rule', url: 'https://www.youtube.com/watch?v=77RVoNXRaTo&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=7' },
          { title: 'The curl right hand rule', url: 'https://www.youtube.com/watch?v=LAnRTNwrFMo&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=8' },
          { title: 'Combining the corner and curl right hand rule', url: 'https://www.youtube.com/watch?v=dap4j3N23kM&list=PLeveVE-rwOyIAtA09hRH28GYxtlUxAclG&index=9' },
        ]
      }
    ]
  },
  {
    id: 'e',
    name: 'E: Nuclear and Quantum Physics',
    subtopics: [
      {
        name: '1: Structure of the atom',
        videos: [
          { title: 'Atomic notation', url: 'https://www.youtube.com/watch?v=OiLvcf6mt5Q&list=PLeveVE-rwOyJxJ1i0xOSibUZDdMIcGJKx&index=1' },
          { title: 'Photon energy and the Planck constant', url: 'https://www.youtube.com/watch?v=3T8T7u2-aVY&list=PLeveVE-rwOyJxJ1i0xOSibUZDdMIcGJKx&index=2' },
          { title: 'Electron energy levels and photons', url: 'https://www.youtube.com/watch?v=ZgKhBcsE49Y&list=PLeveVE-rwOyJxJ1i0xOSibUZDdMIcGJKx&index=3' },
          { title: 'Absorption and emission spectra', url: 'https://www.youtube.com/watch?v=bSI9E2Pc_jU&list=PLeveVE-rwOyJxJ1i0xOSibUZDdMIcGJKx&index=4' },
          { title: 'The Geiger Marsden Rutherford gold foil experiment', url: 'https://www.youtube.com/watch?v=IfeehixQlQA&list=PLeveVE-rwOyJxJ1i0xOSibUZDdMIcGJKx&index=5' },
          { title: 'The four fundamental forces', url: 'https://www.youtube.com/watch?v=jdgLNVwyAEc&list=PLeveVE-rwOyJxJ1i0xOSibUZDdMIcGJKx&index=6' },
        ]
      },
      {
        name: '3: Radioactive decay',
        videos: [
          { title: 'Nuclear radiation and decay', url: 'https://www.youtube.com/watch?v=oXJLHbI6WEc&list=PLeveVE-rwOyKdP757R_yMBC25scsKXf4l&index=1' },
          { title: 'Alpha, beta, and gamma radiation', url: 'https://www.youtube.com/watch?v=u0L3vG9XSyw&list=PLeveVE-rwOyKdP757R_yMBC25scsKXf4l&index=2' },
          { title: 'Half-life', url: 'https://www.youtube.com/watch?v=HbmrhwFdLyk&list=PLeveVE-rwOyKdP757R_yMBC25scsKXf4l&index=3' },
          { title: 'Mass defect and binding energy', url: 'https://www.youtube.com/watch?v=tflg56lLBIU&list=PLeveVE-rwOyKdP757R_yMBC25scsKXf4l&index=4' },
          { title: 'Binding energy per nucleon and stability', url: 'https://www.youtube.com/watch?v=RVDSxJrcRBs&list=PLeveVE-rwOyKdP757R_yMBC25scsKXf4l&index=5' },
          { title: 'Fusion, fission, and energy in nuclear equations', url: 'https://www.youtube.com/watch?v=ctlX7Ee3UKY&list=PLeveVE-rwOyKdP757R_yMBC25scsKXf4l&index=6' },
        ]
      },
      {
        name: '4: Fission',
        videos: [
          { title: 'Fusion, fission, and energy in nuclear equations', url: 'https://www.youtube.com/watch?v=ctlX7Ee3UKY&list=PLeveVE-rwOyJwt81_tJUKtzLtzWPUJ639&index=1' },
        ]
      },
      {
        name: '5: Fusion and stars',
        videos: [
          { title: 'Fusion, fission, and energy in nuclear equations', url: 'https://www.youtube.com/watch?v=ctlX7Ee3UKY&list=PLeveVE-rwOyJbvnx0WqsYX2qYTe6N27M-&index=1' },
          { title: 'The four fundamental forces', url: 'https://www.youtube.com/watch?v=jdgLNVwyAEc&list=PLeveVE-rwOyJbvnx0WqsYX2qYTe6N27M-&index=2' },
          { title: 'Hertzsprung-Russell diagrams of stars', url: 'https://www.youtube.com/watch?v=4rDYdYeRpN0&list=PLeveVE-rwOyJbvnx0WqsYX2qYTe6N27M-&index=3' },
          { title: 'Stellar parallax', url: 'https://www.youtube.com/watch?v=21xoXdlt_n8&list=PLeveVE-rwOyJbvnx0WqsYX2qYTe6N27M-&index=4' },
        ]
      }
    ]
  },
  {
    id: 'lab',
    name: 'Lab Reports and Background Math',
    subtopics: [
      {
        name: 'Lab reports',
        videos: [
          { title: 'Lab reports: independent variable, dependent variable, control variables, and research question', url: 'https://www.youtube.com/watch?v=mN-bFHhBbKw&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=1' },
          { title: 'Measurement uncertainty', url: 'https://www.youtube.com/watch?v=GbnR6QsbE1M&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=2' },
          { title: 'Organizing a data table and statistical uncertainty', url: 'https://www.youtube.com/watch?v=TB3B5ei0vOE&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=3' },
          { title: 'Making the maximum and minimum line of best fit on Logger Pro', url: 'https://www.youtube.com/watch?v=20QWOtCa46A&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=4' },
          { title: 'The average line of best fit equation', url: 'https://www.youtube.com/watch?v=YulavSlL4C0&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=5' },
          { title: 'Proportional reasoning in an IB lab report', url: 'https://www.youtube.com/watch?v=0eNcwGkEyLs&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=6' },
          { title: 'Lab report: meaning of slope and y-intercept', url: 'https://www.youtube.com/watch?v=zBVstNqooZg&list=PLeveVE-rwOyKgUOyBeFz2unDAVZEdqE2p&index=7' },
        ]
      },
      {
        name: 'Background math',
        videos: [
          { title: 'How to find the number of significant figures in a number', url: 'https://www.youtube.com/watch?v=IPp7YTcn3Ho&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=1' },
          { title: 'Calculations with significant figures', url: 'https://www.youtube.com/watch?v=UuAKV4qyLKI&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=2' },
          { title: 'Variables, units, the SI, fundamental vs derived units, and prefixes', url: 'https://www.youtube.com/watch?v=0wsdkyrtfaY&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=3' },
          { title: 'Reducing derived units to fundamental SI units', url: 'https://www.youtube.com/watch?v=k_YDZQzQiw4&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=4' },
          { title: 'Unit conversion using the factor label method', url: 'https://www.youtube.com/watch?v=viFfGjFw-C0&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=5' },
          { title: 'Using linear, quadratic, inverse, & inverse square graphs to understand proportionality', url: 'https://www.youtube.com/watch?v=f58rgn5TnfY&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=6' },
          { title: 'Uncertainty notation and the range of possible values', url: 'https://www.youtube.com/watch?v=FA1aU4fTdiQ&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=7' },
          { title: 'Absolute, fractional, and percent uncertainty', url: 'https://www.youtube.com/watch?v=esop0564GkU&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=8' },
          { title: 'Propagating uncertainty: addition and subtraction', url: 'https://www.youtube.com/watch?v=OzKD76wS010&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=9' },
          { title: 'Propagating uncertainty: multiplication and division', url: 'https://www.youtube.com/watch?v=MXbeWykVdq4&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=10' },
          { title: 'Propagating uncertainty: powers and roots', url: 'https://www.youtube.com/watch?v=lJpUJtHTv9Q&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=11' },
          { title: 'Propagating uncertainty in IB physics problems', url: 'https://www.youtube.com/watch?v=GjbW08T-hlM&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=12' },
          { title: 'Vectors vs scalars', url: 'https://www.youtube.com/watch?v=CMlfMdMxOLM&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=17' },
          { title: 'Labeling vectors and adding vectors using the tip to tail method', url: 'https://www.youtube.com/watch?v=bEQIUEfE72Q&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=18' },
          { title: 'Recording the angle of a vector', url: 'https://www.youtube.com/watch?v=uGkOb0Lw-1E&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=19' },
          { title: 'Using trigonometry to find the angle of a vector', url: 'https://www.youtube.com/watch?v=D_4WG6WO_NE&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=20' },
          { title: 'X and Y components of vectors', url: 'https://www.youtube.com/watch?v=x1n97YDsYzo&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=21' },
          { title: 'Finding vector X and Y components using trigonometry', url: 'https://www.youtube.com/watch?v=GjgHAff_Oio&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=22' },
          { title: 'Adding complex vectors', url: 'https://www.youtube.com/watch?v=2jv4REHqKI0&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=23' },
          { title: 'What the trig identities mean - review of trigonometry', url: 'https://www.youtube.com/watch?v=JBNDaX9eo68&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=24' },
          { title: 'Using trig to find missing sides of a triangle', url: 'https://www.youtube.com/watch?v=S9uA9bQs92E&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=25' },
          { title: 'Inverse trig functions', url: 'https://www.youtube.com/watch?v=NHmHEiY7F-0&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=26' },
          { title: '3D vector notation', url: 'https://www.youtube.com/watch?v=YQXuONgrIS4&list=PLeveVE-rwOyKrfMhNoNOb2U_7Qqvfrbn1&index=27' },
        ]
      }
    ]
  }
];

// Count total videos
export function getTotalVideoCount(): number {
  return physicsTopics.reduce((total, topic) =>
    total + topic.subtopics.reduce((subTotal, sub) => subTotal + sub.videos.length, 0), 0);
}
